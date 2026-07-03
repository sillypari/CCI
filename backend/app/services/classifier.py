from __future__ import annotations

import ipaddress
from dataclasses import dataclass


@dataclass(frozen=True)
class ClassificationResult:
    classification: str
    confidence: float
    operator: str
    asn: str
    app_hint: str


PLATFORM_RELAYS = {
    "Meta WhatsApp": ["31.13.64.0/18", "157.240.0.0/16", "163.70.128.0/17"],
    "Telegram": ["91.108.4.0/22", "149.154.160.0/20"],
    "Google": ["74.125.0.0/16", "142.250.0.0/15"],
}

OPERATOR_RANGES = [
    ("Jio", "AS55836", "49.32.0.0/11"),
    ("Airtel", "AS45609", "106.192.0.0/10"),
    ("Vodafone Idea", "AS38266", "27.56.0.0/13"),
    ("BSNL", "AS9829", "117.192.0.0/10"),
]


def classify_ip(destination_ip: str, destination_port: int, bytes_down: int) -> ClassificationResult:
    try:
        ip = ipaddress.ip_address(destination_ip)
    except ValueError:
        return ClassificationResult("unknown", 0.2, "Unknown", "AS0", "Invalid IP")

    for platform, cidrs in PLATFORM_RELAYS.items():
        if any(ip in ipaddress.ip_network(cidr) for cidr in cidrs):
            return ClassificationResult("relay", 0.82, platform, "relay", f"{platform} relay")

    operator, asn = _operator_for_ip(ip)
    if destination_port in {3478, 3479, 3480, 5349}:
        return ClassificationResult("relay", 0.7, operator, asn, "STUN/TURN signalling")
    if bytes_down > 0 and destination_port >= 1024:
        return ClassificationResult("p2p", 0.9, operator, asn, "Direct media flow")
    return ClassificationResult("unknown", 0.48, operator, asn, "Insufficient flow evidence")


def _operator_for_ip(ip: ipaddress._BaseAddress) -> tuple[str, str]:
    for operator, asn, cidr in OPERATOR_RANGES:
        if ip in ipaddress.ip_network(cidr):
            return operator, asn
    if ip.is_private:
        return "Private Network", "RFC1918"
    return "Unknown ISP", "AS0"

