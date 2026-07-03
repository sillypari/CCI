import hashlib
from dataclasses import dataclass
from typing import Optional


@dataclass
class HandsetInfo:
    imei: str
    tac: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    device_type: Optional[str] = None


class TACDecoder:
    def __init__(self):
        # Mock database for the demo. In a real system, this would load a CSV of TAC codes.
        self.mock_manufacturers = ["Samsung", "Apple", "Xiaomi", "Vivo", "Oppo", "OnePlus", "Realme"]
        self.mock_models = {
            "Samsung": ["Galaxy S23", "Galaxy A54", "Galaxy M32"],
            "Apple": ["iPhone 13", "iPhone 14 Pro", "iPhone 11"],
            "Xiaomi": ["Redmi Note 12", "Poco X5", "Mi 11X"],
            "Vivo": ["V27", "Y100", "X90"],
            "Oppo": ["Reno 8", "F21s Pro", "A78"],
            "OnePlus": ["Nord CE 3", "11R", "9 Pro"],
            "Realme": ["10 Pro", "C55", "Narzo N55"]
        }

    def decode_imei(self, imei: str) -> HandsetInfo:
        if not imei or len(imei) < 8:
            return HandsetInfo(imei=imei)
            
        tac = imei[:8]
        
        # Deterministic mock based on TAC
        hash_val = int(hashlib.md5(tac.encode()).hexdigest()[:8], 16)
        mfg_idx = hash_val % len(self.mock_manufacturers)
        mfg = self.mock_manufacturers[mfg_idx]
        
        models = self.mock_models[mfg]
        model_idx = (hash_val // 10) % len(models)
        model = models[model_idx]
        
        return HandsetInfo(
            imei=imei,
            tac=tac,
            manufacturer=mfg,
            model=model,
            device_type="Smartphone"
        )
