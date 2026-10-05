resource "oci_core_network_security_group" "cfo" {
  compartment_id = var.compartment_ocid
  vcn_id         = data.oci_core_subnet.primary.vcn_id
  display_name   = "${var.name_prefix}-web"
  freeform_tags  = local.tags
}
