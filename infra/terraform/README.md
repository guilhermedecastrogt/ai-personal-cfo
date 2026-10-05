# Terraform

This configuration manages the small part of Oracle Cloud Infrastructure that the CFO needs and nothing else. The VM it runs on already exists and also hosts a Minecraft server, so the configuration is built to be incapable of changing that VM.

## What is managed

| Resource                                 | Purpose                                                          | Created by default |
| ---------------------------------------- | ---------------------------------------------------------------- | ------------------ |
| A network security group                 | Allows TCP 80, TCP 443 and UDP 443 to whatever it is attached to | Yes                |
| Optional SSH rules in that group         | Allows SSH from the sources you list                             | No                 |
| An Object Storage bucket, private        | Off-machine copy of database backups                             | No                 |
| A write-only upload link for that bucket | Lets the VM upload backups without holding OCI credentials       | No                 |
| A lifecycle rule on that bucket          | Deletes backups after a number of days                           | No                 |

## What is deliberately not managed

| Not managed                                    | Why                                                                                       |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| The VM, its boot volume and its public address | They belong to the existing installation. Managing them risks replacement                 |
| The VCN, subnet, route table, internet gateway | Shared with Minecraft                                                                     |
| The existing security list and its rules       | It holds the SSH rule and the Minecraft ports. This configuration never reads or edits it |
| The attachment of the security group to the VM | Attaching is a change to the VM's network interface. It is one manual command, below      |
| Anything inside the VM                         | Docker, swap and the host firewall are documented in `docs/infrastructure.md`             |

The VM is referenced only through `data` sources, which read and never write. There is no `oci_core_instance` resource in this configuration, so no plan can replace, stop or resize the VM. A network security group adds rules to what it is attached to and cannot remove a rule that another list or group grants, so the Minecraft ports are unaffected.

## Authentication

Terraform authenticates with the standard OCI configuration file on your machine. No credential is stored in this repository.

1. In the OCI console, open your user, then **API keys**, then **Add API key**. Download the private key.
2. Put the generated profile in `~/.oci/config` and the key in `~/.oci/`, readable only by you.
3. If the profile is not named `DEFAULT`, set `oci_config_profile`.

The user needs permission to manage network security groups in the compartment, to read instances and virtual network interfaces, and, if you create the bucket, to manage buckets and pre-authenticated requests.

## Variables

```sh
cd infra/terraform
cp environments/production.tfvars.example environments/production.tfvars
```

`*.tfvars` is ignored by Git. Fill in the region, the compartment OCID and the OCID of the existing VM. The other variables have safe defaults and are described in `variables.tf`.

## Checks that need no credentials

```sh
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
terraform test
```

`terraform test` plans against a mocked provider and asserts what the plan contains: only ports 80 and 443, no SSH unless asked, no bucket unless asked, a private bucket and a write-only link when asked. CI runs all four.

## Plan

```sh
terraform init
terraform plan -var-file=environments/production.tfvars -out=cfo.tfplan
```

Read the plan before going further. With the defaults it must say exactly:

- 1 `oci_core_network_security_group` to add,
- 3 `oci_core_network_security_group_security_rule` to add (TCP 80, TCP 443, UDP 443),
- 0 to change, 0 to destroy.

If the plan shows anything to change or destroy, or any resource type not in the table above, stop and do not apply.

The two `check` blocks warn if the VM is not an Ampere A1 shape or is not running.

## Apply

```sh
terraform apply cfo.tfplan
```

Applying a saved plan performs exactly what you reviewed. Do not use `-auto-approve`.

### Attach the security group, once

Creating the group opens nothing until it is attached to the VM's network interface. Terraform prints the command:

```sh
terraform output -raw attach_security_group_command
```

The command lists every group already attached plus the new one, because OCI replaces the list. Check that the list includes the existing groups, then run it. It does not restart the VM or interrupt connections.

If the VM's subnet already allows 80 and 443 through its security list, the group is redundant and you can skip it.

## State

State is local by default, in `terraform.tfstate`, which is ignored by Git. When the bucket is created, the state contains the upload link, so treat the state file as a secret and keep a copy somewhere safe. To share state, configure a remote backend yourself; none is configured here on purpose.

## Importing existing resources

Nothing needs to be imported for the CFO to work.

If you later decide to bring the VM under Terraform, do it as a separate, deliberate change:

1. Write an `oci_core_instance` resource whose arguments match the running VM exactly, with `lifecycle { prevent_destroy = true, ignore_changes = all }`.
2. Run `terraform import oci_core_instance.existing <instance OCID>`.
3. Run `terraform plan` and confirm it shows no changes for the instance. Any proposed replacement means the resource does not match: fix the configuration, do not apply.
4. Only then consider narrowing `ignore_changes`.

Until that plan is clean, leave the VM unmanaged. This configuration does not include that resource, so that an incomplete import cannot be applied by accident.

## Removing what this configuration created

```sh
terraform plan -destroy -var-file=environments/production.tfvars
```

Review it. It can only list resources this configuration created. Before destroying, detach the security group from the VM's network interface by running the attach command without the CFO group in the list.

The bucket has `prevent_destroy`, so a destroy fails while it exists. That is intended: remove the backups and that lifecycle setting by hand first if you really mean to delete them. Never run a destroy without reading its plan.
