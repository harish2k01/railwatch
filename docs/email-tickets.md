# Email tickets

IRCTC's booking confirmation (from `ticketadmin@irctc.co.in`, subject "Booking Confirmation on IRCTC, Train: …") has
no PDF. The ticket is in the body: PNR, train, journey date, From/To, Boarding At, class, quota, the passenger table
(status, coach, seat) and the fare table. RailWatch reads that mail and applies it to the journey on the same date and
route (`src/lib/ticket-email.ts`, `src/lib/ticket-mail-apply.ts`):

- a planned trip becomes booked, with train, PNR, class, coach, seat, status and fare filled in;
- the same email again changes nothing;
- a ticket with no matching journey is added as a booked one-off trip;
- Gmail's forwarding-confirmation mail is shown in Settings so the address can be approved.

Settings → Connections → **Email tickets** offers three sources. Connected Gmail and IMAP sources are checked every
5 minutes by the worker (`pollMailboxes` in `processRailWatch`), looking back 14 days; **Check now** runs it at once.

## Gmail sign-in

Uses the Google OAuth client already configured for Google Calendar, with the `gmail.readonly` scope (requested only
when the user connects Gmail). In the Google Cloud project:

1. Enable the **Gmail API**.
2. On the OAuth consent screen, add the scope `https://www.googleapis.com/auth/gmail.readonly`.
3. While the app is in *Testing*, add each user as a test user. Google shows an "unverified app" screen; that is
   expected for a personal instance. Publishing for other people needs Google's restricted-scope verification.

RailWatch only lists messages matching `from:irctc.co.in` (and Google's forwarding confirmations). Tokens are stored
encrypted (`RailMailbox.gmail`).

## Forwarding address

Settings creates a private URL: `https://<app>/api/railwatch/mail/inbound/<token>`. Anything that can POST a raw
email (RFC 822) to it works. With Cloudflare Email Routing on your domain:

1. Email → Email Routing → enable it for the domain, then create an **Email Worker**:

   ```js
   export default {
     async email(message, env) {
       const raw = await new Response(message.raw).arrayBuffer();
       await fetch(env.RAILWATCH_INBOUND_URL, { method: "POST", headers: { "Content-Type": "message/rfc822" }, body: raw });
     },
   };
   ```

   Set `RAILWATCH_INBOUND_URL` (a secret) to the address from Settings.
2. Add a routing rule, for example `tickets@yourdomain`, that sends to that worker.
3. In Gmail: Settings → Forwarding → add `tickets@yourdomain`. Google sends a confirmation mail; it appears under
   Email tickets in RailWatch with the code and approval link.
4. Add a Gmail filter `from:ticketadmin@irctc.co.in` → Forward to `tickets@yourdomain`.

The token is the only credential: **Reset** issues a new one and the old URL stops working. Requests are limited to
60 an hour per address and 2 MB per message.

## IMAP

Server, port (993, TLS), address and an **app password** (Gmail: Google Account → Security → App passwords; needs
2-Step Verification). RailWatch tests the login before saving and stores the settings encrypted
(`RailMailbox.imap`). It searches INBOX for mail from `irctc.co.in` in the last 14 days. An app password gives full
mailbox access, so prefer Gmail sign-in where possible.

## Cancellations

IRCTC's **Cancel Ticket** email (sent after you cancel on IRCTC) marks the journey with that PNR cancelled and records the refund amount on its fare, so it shows under Refunded on Spend. A PNR that matches no journey changes nothing, and a repeated email changes nothing. Other IRCTC mails, such as eWallet top-ups, are ignored.
