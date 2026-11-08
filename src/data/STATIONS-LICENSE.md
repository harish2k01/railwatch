`stations.json` combines two CC0 sources:

- [Wikidata](https://www.wikidata.org/wiki/Property:P5696) — the "Indian Railways station code" property (P5696),
  [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Current names and codes; refreshed 2026-11-06.
- [datameet/railways](https://github.com/datameet/railways) — the original station list, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/),
  kept for codes Wikidata doesn't have yet.

Refresh with `node scripts/update-stations-wikidata.mjs` (queries Wikidata and merges). IRCTC's own site is not
scraped: its terms forbid automated access.

## Official zonal lists (names win where present)

Official Indian Railways categorisation PDFs (Government of India public documents) set the official spelling for
the codes they list, and add codes missing from the sources above. No station is dropped for being absent from a
zonal list: most zones publish only partial lists. Extracted rows live in `scripts/stations-official/<zone>.tsv`.

| Zone | Source file (date) | Codes in file | Matched existing |
| --- | --- | --- | --- |
| Eastern (ER) | `older.indianrailways.gov.in/cris//uploads/files/1624521405374-.4 Category_wise Stations ZZZ.pdf` (as on 30.04.2021; 587 stations) | 581 | 552 |
| Southern (SR) | `oldsr.indianrailways.gov.in/uploads/files/1728554915426-New categorisation.pdf` (2024-25 proposed, NSG only) | 85 | 85 |
| North Central (NCR) | `oldncr.indianrailways.gov.in/uploads/files/1747996376423-Commercial.pdf` (May 2025, Prayagraj division) | 30 | 26 |
| East Central (ECR) | `oldecr.indianrailways.gov.in/uploads/files/1728373996310-Category of stations.pdf` (Oct 2024, Samastipur division, codes only) | 35 | 35 |

Not sourced: Central Railway's file (`1726117410760-CATEGORISATION OF STATIONS.pdf`) lists 102 stations by name only, without
codes. No categorisation PDF was found for WR, SCR, NFR, NWR, NR, NER, SER, SECR, SWR, WCR, ECoR or Metro. All PDFs were
downloaded on 2026-11-06 from the `old<zone>` mirrors, because the relaunched zonal sites no longer serve them.

Rebuild with `node scripts/build-stations-official.mjs extract <zone> <file.pdf>`, then
`node scripts/build-stations-official.mjs build`. The build also writes `scripts/stations-official/possibly-retired.tsv`:
codes in neither an official list nor Wikidata (datameet-only, 2017), kept for review rather than deleted.

Kept current by `.github/workflows/stations-refresh.yaml` (monthly PR). Codes that are in none of the official
lists, Wikidata or OpenStreetMap are removed and recorded in `scripts/stations-official/removed.tsv` (183 on
2026-11-06); OpenStreetMap (ODbL) is used only to check codes, not as a data source.

## Long-distance filter

`stations.json` keeps only stations listed in `scripts/stations-official/long-distance.tsv`. That file is generated from
[datameet/railways](https://github.com/datameet/railways) `trains.json` + `schedules.json` (CC0, ~2017) by
`node scripts/build-stations-official.mjs long-distance <trains.json> <schedules.json>`:

- **schedule**: a Passenger or Mail/Express-class train (Pass, SF, Exp, Mail, Raj, Shtb, JShtb, GR, SKr, Drnt) actually stops there.
  Passing points have equal or missing arrival/departure and don't count.
- **unverified**: no 2017 schedule at all (newer stations, or lines datameet lacks). Kept until checked.
- Dropped and recorded in `dropped.tsv` (so rebuilds never re-add them): stations served only by EMU/MEMU/DEMU, MMTS/Kolkata/Delhi suburban or toy trains, and "Metro" stations.

To override, edit rows in `long-distance.tsv` by hand, or run the build with `STATIONS_ALL=1` to skip the filter. New codes from the
monthly Wikidata refresh are kept and appended to `long-distance.tsv` as `unverified-new`, and the refresh PR lists them with the counts.

### Trains at a Glance 2026 (official) cross-check

`node scripts/build-stations-official.mjs tag <TAG pdf>...` reads the Railway Board's
[TAG-2026 table PDFs](https://rb.indianrailways.gov.in/show-directorate/view/228) (98 files, downloaded 2026-11-06).
TAG lists principal Mail/Express stops by name only, with no codes. Where exactly one of our stations has that name,
an unverified row is marked `tag2026` (10 stations) and a wrongly dropped row is restored (3: Patliputra, Katni South, Dankuni).
TAG does not list minor halts, so it can't settle most of the unverified stations.

## NTES timetable (via railpull)

The monthly refresh crawls the current Indian Railways timetable from NTES with
[railpull](https://github.com/shwetankg07/railpull) (MIT), at its default polite rate, and uses it only to decide
which stations are long-distance stops. The crawled timetable is not stored or redistributed; only the derived
station codes are committed. railpull uses an unofficial NTES client and has no connection to Indian Railways,
IRCTC, CRIS or NTES.
