# Ingestion pipeline

**Run Research Now** starts an operator-authorized server action. It records a Crossref run, queries the *Transactions of the Association for Computational Linguistics* journal feed (ISSN 2307-387X), validates up to two pages of six articles from the preceding year, and persists each article with DOI and source metadata. The final run record is visible in System Health. [Crossref REST API tips](https://www.crossref.org/documentation/retrieve-metadata/rest-api/tips-for-using-the-crossref-rest-api/)

The adapter retries a transient failure once and backs off on rate limits. Existing canonical DOI URLs reuse the same story, and identical reference metadata is stored once. The summary describes the bibliographic record. Peer-review status defaults to unknown.

The first run tracks collected, created and rejected records. A partial run preserves successful writes. A stale run can be marked failed by the next run after five minutes. A durable worker, cursor checkpointing and daily scheduling are later phases.

Use `npm run test:source` to validate the live feed without persisting records. A Crossref contact email can be provided for polite-pool access.
