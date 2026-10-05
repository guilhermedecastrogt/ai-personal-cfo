data "oci_core_instance" "existing" {
  instance_id = var.existing_instance_ocid
}

data "oci_core_vnic_attachments" "existing" {
  compartment_id = data.oci_core_instance.existing.compartment_id
  instance_id    = var.existing_instance_ocid
}

data "oci_core_vnic" "primary" {
  vnic_id = local.primary_vnic_id
}

data "oci_core_subnet" "primary" {
  subnet_id = data.oci_core_vnic.primary.subnet_id
}

check "existing_instance_is_arm" {
  assert {
    condition     = strcontains(data.oci_core_instance.existing.shape, "A1")
    error_message = "The existing instance is not an Ampere A1 shape. The container images are built for linux/arm64."
  }
}

check "existing_instance_is_running" {
  assert {
    condition     = data.oci_core_instance.existing.state == "RUNNING"
    error_message = "The existing instance is not running."
  }
}
