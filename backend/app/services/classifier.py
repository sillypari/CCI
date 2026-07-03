from __future__ import annotations

import ipaddress
from dataclasses import dataclass
from pathlib import Path

from app.services.ip_decoder import IPDecoder

# Initialize a global IPDecoder instance to avoid reloading databases for each call
decoder = IPDecoder(data_dir=Path(__file__).parent.parent.parent / "data")

@dataclass(frozen=True)
class ClassificationResult:
    classification: str
    confidence: float
    operator: str
    asn: str
    app_hint: str
    voip: bool = False

def classify_ip(destination_ip: str, destination_port: int, bytes_down: int, protocol: str = "UDP", duration: int = 0) -> ClassificationResult:
    if not destination_ip:
        return ClassificationResult("unknown", 0.2, "Unknown", "AS0", "Missing IP")

    try:
        ip = ipaddress.ip_address(destination_ip)
    except ValueError:
        return ClassificationResult("unknown", 0.2, "Unknown", "AS0", "Invalid IP")

    if ip.is_private:
        return ClassificationResult("unknown", 0.1, "Private Network", "RFC1918", "Private IP")

    decode_result = decoder.decode(destination_ip)
    operator = decode_result.asn_name or "Unknown ISP"
    asn = decode_result.asn or "AS0"

    # VoIP Detection heuristics
    is_voip = False
    app_hint = "Insufficient flow evidence"
    
    if decode_result.is_platform_relay:
        platform = decode_result.platform_name
        app_hint = f"{platform} relay"
        
        # Check for VoIP heuristics: typical media relay is UDP, ports >= 1024, duration > 10s
        if protocol.upper() == "UDP" and destination_port >= 1024 and duration > 10:
            is_voip = True
            app_hint = f"{platform} VoIP Call (Relayed)"
            
        return ClassificationResult("relay", 0.85, platform, asn, app_hint, voip=is_voip)

    # Signaling check (often STUN/TURN standard ports)
    if destination_port in {3478, 3479, 3480, 5349}:
        return ClassificationResult("relay", 0.7, operator, asn, "STUN/TURN signalling")

    # Direct P2P Media Flow
    if bytes_down > 0 and destination_port >= 1024:
        if protocol.upper() == "UDP" and duration > 10:
            is_voip = True
            app_hint = "Direct P2P VoIP Call"
        else:
            app_hint = "Direct media flow"
        return ClassificationResult("p2p", 0.9, operator, asn, app_hint, voip=is_voip)

    return ClassificationResult("unknown", 0.48, operator, asn, app_hint)
