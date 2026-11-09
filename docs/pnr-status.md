# PNR status

Opening a saved journey with a 10-digit PNR refreshes its status automatically. The PNR section shows original booking and current passenger statuses, supplied coach/berth fields, chart preparation, and **Last refreshed** in IST. Existing results remain visible during the check; a manual Refresh status action permits retry.

There is no tracking toggle, scheduled PNR polling, or PNR background-notification job. Reopening within 60 seconds reuses the last successful result to avoid duplicate requests. Failed checks retain the last successful snapshot and its refresh time.

When every passenger explicitly reports CAN, CANCELLED or CANCELED, an active journey moves to Cancelled and receives a cancellation date in IST. Partial cancellations, ambiguous statuses, invalid or flushed PNRs, and lookup failures do not cancel a journey. Original fare details remain unchanged and no refund is inferred. Existing cancelled/history records are not automatically restored. Normal archive and PDF retention policies apply from the detected cancellation date.

The backend uses `ntes-client==0.1.4` through `scripts/ntes/pnr.py`. PNR enquiry uses Indian Railways' separate enquiry endpoint and the client's CAPTCHA handling. It is an unofficial integration, and availability is not guaranteed. Failed, malformed, empty, flushed and mismatched results never replace the last successful snapshot. The user can open the official enquiry page as a fallback.

Snapshots stay inside the account's encrypted journey payload in either storage format. The API accepts an owned journey ID, not an arbitrary PNR. Requests require authentication and a same-origin mutation; checks are limited to 20 per account/hour and one per journey/minute. Network calls run outside database transactions; saves recheck identity and revisions. No PNR or provider response body is logged. The Python adapter receives PNR through stdin, has bounded output, and is killed after 22 seconds. Only one lookup runs per backend replica at a time.

## Runtime

The application image bundles Python, Pillow and the pinned client. The adapter runs as the backend's existing unprivileged user; no new public service or database migration is required. Backend outbound HTTPS must reach `indianrail.gov.in`. The frontend never calls that site directly.

For local development create a virtual environment with Python 3.12+ and install `scripts/ntes/requirements.txt`. Set `PNR_PYTHON` in the backend environment to that environment's Python executable. The default is `python3`; the image uses `/opt/ntes/bin/python3`. The client requires Pillow, requests and pycryptodome, installed by pip. The local Windows verification environment is `.venv-pnr` (ignored).

Fare ingestion and Spend are deliberately unchanged. Train discovery and live running status remain deferred. A successful connectivity probe alone does not establish successful retrieval of an active PNR. Validate with a current ticket from the deployed backend network before treating production tracking as accepted.
