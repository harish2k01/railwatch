"""Private backend adapter. PNR enters through stdin, never arguments or logs."""
import json
import re
import sys
from ntes import NTESClient

try:
    value = json.loads(sys.stdin.read(256))
    pnr = value.get("pnr", "")
    if not isinstance(pnr, str) or not re.fullmatch(r"\d{10}", pnr):
        raise ValueError("invalid input")
    # The parent enforces a whole-process deadline; each network operation is bounded too.
    data = NTESClient(timeout=6, retries=0).pnr_status(pnr)
    # Only the fields used for status leave the adapter. Do not return provider diagnostics or fares.
    if not isinstance(data, dict) or data.get("errorMessage"):
        raise ValueError("lookup unsuccessful")
    json.dump({key: data.get(key) for key in ("PNR", "passengers", "other_info", "chartStatus")}, sys.stdout)
except Exception:
    print('{"error":"PNR_UNAVAILABLE"}')
    sys.exit(1)
