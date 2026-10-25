# Ticket reader

Open a ticket card to view the account-owned original. The document reader scrolls continuously through pages and provides page navigation, zoom, fit-to-width, fit-to-page, rotation, thumbnails on desktop, and search. Text selection and search require text embedded in the PDF; an image-only scan does not become searchable merely by opening it.

Download and Open in browser / print are available from Document actions. The latter opens a temporary local blob in the browser's own viewer, where supported. Private documents are never sent to an external viewing service. A failed preview offers the original as a fallback.

PDF assets, fonts and decoding support are served locally. Account-owned files are fetched through authenticated endpoints. PDF deletion still follows the seven-day cancellation/completion retention policy; journey records remain available independently of the original file.

On a phone, the reader fills the screen and keeps scrolling within the document. Two-finger pinch and zoom controls redraw the document. Physical-device browser gestures, system printing, and installed-PWA behavior should also be checked on the target phone after deployment.
