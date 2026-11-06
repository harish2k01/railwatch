`stations.json` combines two CC0 sources:

- [Wikidata](https://www.wikidata.org/wiki/Property:P5696) — the "Indian Railways station code" property (P5696),
  [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Current names and codes; refreshed 2026-11-06.
- [datameet/railways](https://github.com/datameet/railways) — the original station list, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/),
  kept for codes Wikidata doesn't have yet.

Refresh with `node scripts/update-stations-wikidata.mjs` (queries Wikidata and merges). IRCTC's own site is not
scraped: its terms forbid automated access.
