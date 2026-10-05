variable "region" {
  description = "OCI region of the existing VM, for example eu-frankfurt-1."
  type        = string
}

variable "oci_config_profile" {
  description = "Profile in ~/.oci/config used to authenticate. Credentials never live in this repository."
  type        = string
  default     = "DEFAULT"
}

variable "compartment_ocid" {
  description = "Compartment that holds the existing VM. CFO resources are created here."
  type        = string

  validation {
    condition     = can(regex("^ocid1\\.(compartment|tenancy)\\.", var.compartment_ocid))
    error_message = "compartment_ocid must be a compartment or tenancy OCID."
  }
}

variable "existing_instance_ocid" {
  description = "OCID of the existing Ampere A1 VM. It is only read, never managed."
  type        = string

  validation {
    condition     = can(regex("^ocid1\\.instance\\.", var.existing_instance_ocid))
    error_message = "existing_instance_ocid must be an instance OCID."
  }
}

variable "name_prefix" {
  description = "Prefix for the names of resources this configuration creates."
  type        = string
  default     = "ai-personal-cfo"
}

variable "web_ingress_cidrs" {
  description = "Sources allowed to reach HTTP and HTTPS."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "ssh_ingress_cidrs" {
  description = "Extra sources allowed to reach SSH through the CFO security group. Leave empty to rely on the rules the VM already has."
  type        = list(string)
  default     = []
}

variable "enable_http3" {
  description = "Allow UDP 443 so Caddy can serve HTTP/3."
  type        = bool
  default     = true
}

variable "create_backup_bucket" {
  description = "Create a private Object Storage bucket for database backups."
  type        = bool
  default     = false
}

variable "backup_upload_expires_at" {
  description = "RFC 3339 time at which the write-only upload link for backups stops working. Required when create_backup_bucket is true."
  type        = string
  default     = null

  validation {
    condition     = var.backup_upload_expires_at == null || can(formatdate("YYYY", var.backup_upload_expires_at))
    error_message = "backup_upload_expires_at must be an RFC 3339 timestamp such as 2027-10-01T00:00:00Z."
  }
}

variable "backup_retention_days" {
  description = "Days after which objects in the backup bucket are deleted. Set to 0 to keep them until removed by hand."
  type        = number
  default     = 0

  validation {
    condition     = var.backup_retention_days >= 0 && floor(var.backup_retention_days) == var.backup_retention_days
    error_message = "backup_retention_days must be a whole number of days, or 0."
  }
}
