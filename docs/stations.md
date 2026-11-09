# Station directory

The bundled src/data/stations.json is the station picker source of truth. It contains code/name pairs derived from NTES schedules. There are no legacy station datasets, manual exclusions, or alternate-source merge scripts. The existing directory remains until a successful refresh.

The monthly workflow uses scripts/ntes/crawl.py and ntes-client 0.1.4 directly in this repository. The crawler was adapted from harish2k01/railpull (originally shwetankg07/railpull); its MIT notice is preserved in scripts/ntes/LICENSE. NTES is the data source; this unofficial client is the transport.

Run pip install -r scripts/ntes/requirements.txt, python scripts/ntes/crawl.py, then node scripts/ntes/build-stations.mjs scripts/data/raw from the repository root. Raw files are ignored and never committed.

Discovery and schedule retrieval resume from this month's cache. Requests are separated by at least 1.2 seconds plus jitter, with backoff on failure. The workflow runs on the homelab network; it does not check out another repository.

The directory includes stops served by recognised long-distance categories. Passenger-only, suburban, EMU, MEMU, DEMU, DMU, MMTS, toy and Namo Bharat/Vande Metro categories are excluded. Unknown categories stop publication for review. Intermediate pass-through records are excluded. Codes must be 1–5 uppercase letters. Names come from NTES with display casing, not previous names.

Publication requires a completed crawl, at least 5,000 schedules, 45,000 qualifying stop records, 6,500 stations and no greater than a 10% station-count reduction. Additions, removals and name changes appear in the refresh PR. Failures preserve the last good JSON. These are completeness guards, not proof of railway booking availability.

The retained JSON was produced under the earlier policy, which also admitted Passenger stops. The next successful native refresh applies the narrower long-distance category policy; it is not regenerated without a complete crawl. Long-distance is a category-based product filter, not a minimum-kilometre threshold.
