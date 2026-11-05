# Design system

## Colour

Design tokens are CSS custom properties prefixed `--rw-` in `src/app/globals.css`, defined for light and dark themes. Components use the tokens, not raw colours.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--rw-brand` | `#4C4DDC` | `#8B8CF6` | Primary buttons, links, focus, selected navigation |
| `--rw-brand-ink` | `#FFFFFF` | `#0E0F2E` | Text on brand fills |
| `--rw-brand-soft` / `-soft-ink` | `#E9E9FD` / `#3B3CB8` | `#1F2046` / `#C7C8FC` | Tinted highlights, counts |

Status colours are separate from the brand and stay the same meaning everywhere: open/booking (`--rw-open*`), booked (`--rw-booked*`), attention (`--rw-attention*`), to cancel (`--rw-cancel*`) and time off (`--rw-timeoff*`). Light mode uses the base indigo so white text passes contrast.

## Logo and icons

The mark is a signal lamp: a solid signal head with a lit top lens, a dimmed lower lens, a stem and a base (`src/components/railwatch-mark.tsx`). The body uses `currentColor`; the lenses use `--rw-mark-lamp`, which defaults to the brand colour. On a brand-coloured tile, set `--rw-mark-lamp: var(--rw-brand)` so the lenses read as cut-outs.

`src/app/icon.svg`, `src/app/favicon.ico` and the PWA icons in `public/icons/` (192, 512, maskable 512 with the glyph inside the safe zone, Apple touch 180) are generated. After changing the mark, run:

```sh
node scripts/generate-icons.mjs
```

The theme colour in `src/app/manifest.ts` and `src/app/layout.tsx`, `public/offline.html` and the email template in `src/lib/message-templates.ts` use the same palette.

## Copy

UI text is sentence case. Product names and acronyms keep their capitals (RailWatch, Telegram, Google Calendar, IRCTC, PDF, PNR). Loading states use skeletons rather than "Loading…" text.

## Station directory

`src/data/stations.json` holds about 8,950 `[code, name]` pairs derived from [datameet/railways](https://github.com/datameet/railways) (CC0, see `src/data/STATIONS-LICENSE.md`). It is lazy-loaded the first time a station field is used. `StationInput` suggests recent stations first, then matches by code and name; free text is still accepted. The list dates from about 2017, so some newer codes and renamed stations are missing. Regenerate with `node scripts/generate-stations.mjs <stations.json>`.
