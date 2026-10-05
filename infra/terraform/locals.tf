locals {
  tags = {
    project    = var.name_prefix
    managed-by = "terraform"
  }

  tcp_protocol = "6"
  udp_protocol = "17"

  web_ports = [80, 443]

  web_rules = {
    for pair in setproduct(var.web_ingress_cidrs, local.web_ports) :
    "${pair[0]}-${pair[1]}" => { cidr = pair[0], port = pair[1] }
  }

  primary_vnic_id = one([
    for attachment in data.oci_core_vnic_attachments.existing.vnic_attachments :
    attachment.vnic_id if attachment.state == "ATTACHED"
  ])

  security_group_ids = distinct(concat(
    tolist(data.oci_core_vnic.primary.nsg_ids),
    [oci_core_network_security_group.cfo.id],
  ))
}
