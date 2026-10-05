data "oci_objectstorage_namespace" "current" {
  count = var.create_backup_bucket ? 1 : 0

  compartment_id = var.compartment_ocid
}

resource "oci_objectstorage_bucket" "backups" {
  count = var.create_backup_bucket ? 1 : 0

  compartment_id = var.compartment_ocid
  namespace      = data.oci_objectstorage_namespace.current[0].namespace
  name           = "${var.name_prefix}-backups"
  access_type    = "NoPublicAccess"
  storage_tier   = "Standard"
  versioning     = "Disabled"
  freeform_tags  = local.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "oci_objectstorage_preauthrequest" "backup_upload" {
  count = var.create_backup_bucket ? 1 : 0

  namespace    = data.oci_objectstorage_namespace.current[0].namespace
  bucket       = oci_objectstorage_bucket.backups[0].name
  name         = "${var.name_prefix}-backup-upload"
  access_type  = "AnyObjectWrite"
  time_expires = var.backup_upload_expires_at

  lifecycle {
    precondition {
      condition     = var.backup_upload_expires_at != null
      error_message = "Set backup_upload_expires_at when create_backup_bucket is true."
    }
  }
}

resource "oci_objectstorage_object_lifecycle_policy" "backups" {
  count = var.create_backup_bucket && var.backup_retention_days > 0 ? 1 : 0

  namespace = data.oci_objectstorage_namespace.current[0].namespace
  bucket    = oci_objectstorage_bucket.backups[0].name

  rules {
    name        = "expire-old-backups"
    action      = "DELETE"
    is_enabled  = true
    time_amount = var.backup_retention_days
    time_unit   = "DAYS"
  }
}
