import hashlib
import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class CellDecodeResult:
    cell_id: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    operator: Optional[str] = None
    address: Optional[str] = None
    area_type: Optional[str] = None


class CellDecoder:
    def __init__(self):
        # We use a mock strategy for the demo as requested, generating
        # consistent random coordinates based on a hash of the Cell ID
        pass

    def decode(self, cell_id: str) -> CellDecodeResult:
        if not cell_id:
            return CellDecodeResult(cell_id=cell_id)

        # Generate deterministic mock coordinates based on the cell ID
        # Centered roughly around Gwalior/Madhya Pradesh
        base_lat = 26.2183
        base_lng = 78.1828
        
        # Create a stable numeric value from the cell ID string
        hash_val = int(hashlib.md5(cell_id.encode()).hexdigest()[:8], 16)
        
        # Offset lat/lng by a small amount based on the hash
        # 1 degree is approx 111km, so 0.1 is ~11km
        lat_offset = ((hash_val % 1000) / 1000.0 - 0.5) * 0.2
        lng_offset = (((hash_val // 1000) % 1000) / 1000.0 - 0.5) * 0.2
        
        op_code = hash_val % 4
        operators = ["Jio", "Airtel", "Vodafone Idea", "BSNL"]
        
        return CellDecodeResult(
            cell_id=cell_id,
            latitude=round(base_lat + lat_offset, 6),
            longitude=round(base_lng + lng_offset, 6),
            operator=operators[op_code],
            address=f"Tower Sector {hash_val % 100}, Gwalior Region",
            area_type="Urban" if hash_val % 2 == 0 else "Rural"
        )
