output "instance_public_ip" {
  description = "Public address of the existing VM. Point the DNS record of the CFO domain here."
  value       = data.oci_core_vnic.primary.public_ip_address
}

output "instance_shape" {
  description = "Shape of the existing VM, read for reference."
  value       = data.oci_core_instance.existing.shape
}

output "security_group_id" {
  description = "Network security group that allows web traffic to the CFO."
  value       = oci_core_network_security_group.cfo.id
}

output "attach_security_group_command" {
  description = "Run once, by hand, to add the CFO security group to the VM's network interface. It keeps every group already attached."
  value       = "oci network vnic update --vnic-id ${local.primary_vnic_id} --nsg-ids '${jsonencode(local.security_group_ids)}'"
}

output "backup_bucket" {
  description = "Name of the backup bucket, when one is created."
  value       = one(oci_objectstorage_bucket.backups[*].name)
}

output "backup_upload_url" {
  description = "Write-only upload link for backups. Put it in BACKUP_UPLOAD_URL on the VM. Treat it as a secret."
  sensitive   = true
  value = one([
    for request in oci_objectstorage_preauthrequest.backup_upload :
    "https://objectstorage.${var.region}.oraclecloud.com${request.access_uri}"
  ])
}
