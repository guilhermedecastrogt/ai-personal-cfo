resource "oci_core_network_security_group_security_rule" "web" {
  for_each = local.web_rules

  network_security_group_id = oci_core_network_security_group.cfo.id
  description               = "CFO web traffic on port ${each.value.port}"
  direction                 = "INGRESS"
  protocol                  = local.tcp_protocol
  source_type               = "CIDR_BLOCK"
  source                    = each.value.cidr
  stateless                 = false

  tcp_options {
    destination_port_range {
      min = each.value.port
      max = each.value.port
    }
  }
}

resource "oci_core_network_security_group_security_rule" "http3" {
  for_each = var.enable_http3 ? toset(var.web_ingress_cidrs) : toset([])

  network_security_group_id = oci_core_network_security_group.cfo.id
  description               = "CFO HTTP/3"
  direction                 = "INGRESS"
  protocol                  = local.udp_protocol
  source_type               = "CIDR_BLOCK"
  source                    = each.value
  stateless                 = false

  udp_options {
    destination_port_range {
      min = 443
      max = 443
    }
  }
}

resource "oci_core_network_security_group_security_rule" "ssh" {
  for_each = toset(var.ssh_ingress_cidrs)

  network_security_group_id = oci_core_network_security_group.cfo.id
  description               = "CFO deployment over SSH"
  direction                 = "INGRESS"
  protocol                  = local.tcp_protocol
  source_type               = "CIDR_BLOCK"
  source                    = each.value
  stateless                 = false

  tcp_options {
    destination_port_range {
      min = 22
      max = 22
    }
  }
}
