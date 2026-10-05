mock_provider "oci" {}

override_data {
  target = data.oci_core_instance.existing
  values = {
    compartment_id = "ocid1.compartment.oc1..existing"
    shape          = "VM.Standard.A1.Flex"
    state          = "RUNNING"
  }
}

override_data {
  target = data.oci_core_vnic_attachments.existing
  values = {
    vnic_attachments = [
      { vnic_id = "ocid1.vnic.oc1..primary", state = "ATTACHED" },
      { vnic_id = "ocid1.vnic.oc1..old", state = "DETACHED" },
    ]
  }
}

override_data {
  target = data.oci_core_vnic.primary
  values = {
    subnet_id         = "ocid1.subnet.oc1..existing"
    public_ip_address = "203.0.113.10"
    nsg_ids           = ["ocid1.networksecuritygroup.oc1..minecraft"]
  }
}

override_data {
  target = data.oci_core_subnet.primary
  values = {
    vcn_id = "ocid1.vcn.oc1..existing"
  }
}

variables {
  region                 = "eu-frankfurt-1"
  compartment_ocid       = "ocid1.compartment.oc1..cfo"
  existing_instance_ocid = "ocid1.instance.oc1.eu-frankfurt-1.existing"
}

run "creates_only_a_security_group_by_default" {
  command = plan

  assert {
    condition     = oci_core_network_security_group.cfo.vcn_id == "ocid1.vcn.oc1..existing"
    error_message = "The security group must be created in the VCN of the existing VM."
  }

  assert {
    condition     = join(",", sort(keys(oci_core_network_security_group_security_rule.web))) == "0.0.0.0/0-443,0.0.0.0/0-80"
    error_message = "Only ports 80 and 443 may be opened for web traffic."
  }

  assert {
    condition     = length(oci_core_network_security_group_security_rule.ssh) == 0
    error_message = "SSH must not be opened unless a source is given."
  }

  assert {
    condition     = length(oci_objectstorage_bucket.backups) == 0
    error_message = "No bucket may be created unless asked for."
  }

  assert {
    condition     = output.instance_public_ip == "203.0.113.10"
    error_message = "The public address must be read from the existing VM."
  }
}

run "opens_no_database_or_game_port" {
  command = plan

  assert {
    condition = alltrue([
      for rule in oci_core_network_security_group_security_rule.web :
      contains([80, 443], rule.tcp_options[0].destination_port_range[0].min) &&
      rule.tcp_options[0].destination_port_range[0].min == rule.tcp_options[0].destination_port_range[0].max
    ])
    error_message = "A web rule opens something other than a single port 80 or 443."
  }

  assert {
    condition     = alltrue([for rule in oci_core_network_security_group_security_rule.web : rule.direction == "INGRESS"])
    error_message = "Only ingress rules are expected."
  }
}

run "restricts_ssh_to_the_given_sources" {
  command = plan

  variables {
    ssh_ingress_cidrs = ["198.51.100.7/32"]
    enable_http3      = false
  }

  assert {
    condition     = join(",", keys(oci_core_network_security_group_security_rule.ssh)) == "198.51.100.7/32"
    error_message = "SSH must be limited to the listed sources."
  }

  assert {
    condition     = length(oci_core_network_security_group_security_rule.http3) == 0
    error_message = "HTTP/3 must be off when disabled."
  }
}

run "creates_a_private_bucket_when_asked" {
  command = plan

  variables {
    create_backup_bucket     = true
    backup_upload_expires_at = "2027-10-01T00:00:00Z"
    backup_retention_days    = 30
  }

  assert {
    condition     = oci_objectstorage_bucket.backups[0].access_type == "NoPublicAccess"
    error_message = "The backup bucket must be private."
  }

  assert {
    condition     = oci_objectstorage_preauthrequest.backup_upload[0].access_type == "AnyObjectWrite"
    error_message = "The upload link must be write-only."
  }

  assert {
    condition     = join(",", [for rule in oci_objectstorage_object_lifecycle_policy.backups[0].rules : tostring(rule.time_amount)]) == "30"
    error_message = "The retention rule must use the configured number of days."
  }
}

run "refuses_a_bucket_without_an_expiry_for_the_upload_link" {
  command = plan

  variables {
    create_backup_bucket = true
  }

  expect_failures = [oci_objectstorage_preauthrequest.backup_upload]
}

run "rejects_an_identifier_that_is_not_an_instance" {
  command = plan

  variables {
    existing_instance_ocid = "ocid1.vcn.oc1..not-an-instance"
  }

  expect_failures = [var.existing_instance_ocid]
}
