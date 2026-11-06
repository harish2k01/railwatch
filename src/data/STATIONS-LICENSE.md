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
