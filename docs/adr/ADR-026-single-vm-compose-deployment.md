# ADR-026: Production runs as a Compose stack on a shared VM, and Terraform does not own that VM

- Status: Accepted
- Date: 2026-10-05

## Context

The system needs somewhere to run. What is available is one Oracle Cloud Always Free Ampere A1 VM, about 2 OCPU and 12 GB, ARM64, that already runs a Minecraft server. The CFO has to share it without disturbing it.

Two questions follow. How is the application run and updated on that machine, and how much of the machine's infrastructure should be described in Terraform when the machine predates the project and serves something else?

Representing an existing VM in Terraform means writing a resource whose every argument matches reality and importing it. Any mismatch shows up as a proposed change, and for several instance arguments a change means replacement. The cost of getting that wrong is the Minecraft server's disk.

## Decision

**The application runs as a Docker Compose project.** Four long-running containers, Caddy, the web application, the API and PostgreSQL, and one that runs migrations and exits. PostgreSQL is on an internal network with no published port. Caddy is the only container with published ports and forwards a single path to the API.

**Every container has a memory and CPU ceiling**, sized so the whole stack stays under about 2 GB and about one CPU.

**Images are built in CI for ARM64, published to GitHub Container Registry and tagged with the commit SHA.** Nothing is built on the VM, and no mutable tag is used.

**Deployment is a script on the VM, started over SSH by a workflow.** It pulls, backs up, migrates, replaces containers, and verifies, stopping at the first failure. Migrations run before any container is replaced, so a failed migration leaves the old release serving.

**Secrets live in one file on the VM.** GitHub holds only what is needed to reach the machine.

**Terraform reads the VM and manages only what the CFO adds:** a network security group for web traffic and, optionally, a backup bucket with a write-only upload link. The VM, its disk, its network and its existing firewall rules are not resources in the configuration. Attaching the security group to the VM is a documented manual command.

**Backups are logical dumps taken by a host timer**, kept outside the database volume, with an optional upload that needs no cloud credential on the machine.

**Observability is logs, health checks and request identifiers.** No metrics or tracing stack is added.

## Alternatives considered

- **Importing the VM into Terraform.** Rejected for now. It adds risk to the one thing that must not break and adds nothing the CFO needs. The path is documented for whoever wants to take it deliberately.
- **A second VM for the CFO.** The free allowance could be split, but the request was to coexist on the existing machine, and a second VM means a second thing to patch.
- **Building images on the VM.** Rejected. A build competes with Minecraft for CPU and memory, and what runs would no longer be what CI tested.
- **Kubernetes, or a managed database.** Out of proportion for one household's data on one free machine.
- **Blue-green deployment on the same VM.** It would roughly double the memory in use during a deployment and needs coordination in the proxy. A few seconds of downtime is acceptable here.
- **A metrics stack.** Prometheus and Grafana would use more memory than the application. Logs and health checks answer the questions this system raises.

## Consequences

- A deployment has a short outage while containers are replaced.
- The machine is a single point of failure for the application and its data. The off-machine backup is what makes losing it recoverable, and it is optional, so it has to be turned on.
- Migrations must be compatible with the previous release, because that release keeps serving while they run and because rollback does not revert them.
- Part of the infrastructure is described in documentation instead of code: Docker, swap, the host firewall and the security group attachment.
- Rate limits stay per process, which holds as long as there is one API container ([ADR-025](ADR-025-in-process-security-controls.md)).
- The CFO's performance depends on how much the Minecraft server is using, which this project neither controls nor measures.
