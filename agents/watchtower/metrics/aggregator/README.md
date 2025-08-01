Metrics Aggregator Worker

- Reads raw metrics from WATCHTOWER_METRICS KV.
- Aggregates stats (counts, error rates, timings).
- Writes summary to METRICS_AGGREGATES KV.
- Provides HTTP endpoints for triggering and viewing aggregation.
