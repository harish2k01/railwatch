# PNR status

A saved journey with a 10-digit PNR has a **PNR status** section. The status is checked only when you click **Check status**: RailWatch shows Indian Railways' enquiry check (a small sum such as "33 + 10 = ?"), you type the answer, and RailWatch submits it with the journey's saved PNR. Nothing solves that check automatically, and there is no background polling.

RailWatch suggests a check when travel is close: within three days of the journey, if the ticket is waitlisted or RAC, or hasn't been checked in the last 12 hours. The suggestion shows on the journey and on Today's next trip; it never runs a check by itself.

The section shows each passenger's booking and current status, coach and berth when supplied, chart preparation and when it was last checked (IST). A failed check keeps the last successful result. A wrong answer records nothing; RailWatch fetches a new picture to try again. Each picture takes one answer and expires after three minutes.

## Cancellations

When every passenger shows CAN, CANCELLED or CANCELED, RailWatch offers **Mark cancelled** and asks before changing the journey. Partial or ambiguous statuses offer nothing. Fares stay unchanged and no refund is inferred (IRCTC's cancellation email records the refund).

## How it talks to Indian Railways

The backend calls the enquiry's own endpoints on `indianrail.gov.in` (CAPTCHA picture, then the answer with the PNR) with a plain `RailWatch` user agent; it doesn't pretend to be a browser. If the site stops answering those requests, the check fails with a message and the **Check on Indian Railways** link remains. This is an unofficial integration and may stop working at any time.

The API accepts an owned journey ID, never an arbitrary PNR. Requests need a signed-in, same-origin call and are rate-limited (30 an hour per account, 6 pictures a minute per journey). The site session for a check lives in backend memory for three minutes, bound to the account, journey and PNR. Network calls run outside database transactions, and saves recheck the journey and revision. No PNR or response body is logged. Backend outbound HTTPS must reach `indianrail.gov.in`; the browser never calls it.

Snapshots stay inside the account's encrypted journey payload.
