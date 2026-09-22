# Node.js monitoring

## Apply the changes

1. Restart the Node.js application using its existing process manager (or let nodemon reload).
2. In Grafana, import `monitoring/nodejs-dashboard.json` and select your Prometheus data source. This creates a separate dashboard named `Prestige Hostel — Node.js`.
3. Select `localhost:5900` (or All), send some application requests, and allow several 15-second scrapes for rates to appear.

No Prometheus configuration change is required. For Grafana running in this Compose network, the Prometheus data source URL is `http://prometheus:9090`.

## Comparison with dashboard 11159

- The app already uses prom-client 15 and collects default metrics, including Node.js version. Keep `collectDefaultMetrics({ register })`; the old example's `timeout` is unnecessary because default metrics are collected on scrape.
- The async metrics endpoint and content type were already correct for Express. Koa middleware and pino timestamps are unnecessary here.
- Dashboard 11159 revision 1 queries default runtime metrics only; its optional `nodejs_http_total_count` and `nodejs_http_total_duration` examples are not used by that revision's panels.
- Keep the existing `http_requests_total` name. The new histogram `http_request_duration_seconds` measures latency with a monotonic clock, in seconds, and supports averages and percentiles. The example's accumulating duration gauge does not represent the last request duration as its help text claims.
- Request collection now runs before webhooks, JSON parsing, and CORS. It labels completed requests with the mounted route template and status; unknown routes use `unmatched`. It excludes the metrics endpoint. Existing route-label values will change to full mounted templates. Custom nested routers with dynamic mount parameters would need additional normalization.
- HTTP metrics count completed responses, not aborted connections. Idle routes have no series until their first response. Old series remain in historical queries until retention expires.
- The supplied dashboard uses modern stat/time-series panels, scopes queries to `prestige-hostel-local`, displays version as a series name, and replaces the original short-window restart estimate with process uptime. It adds request rate, p95 latency, and 5xx response rate.

## Diagnose a missing version

In Prometheus or Grafana Explore, query:

```promql
nodejs_version_info{job="prestige-hostel-local",instance="localhost:5900"}
```

The value is always `1`; the actual version is the `version` label. On verification, the live app and Prometheus both reported `version="v22.17.1"`.

To fix the existing dashboard's version panel instead of importing the supplied dashboard, use a Stat visualization, enable an Instant query, set the legend to `{{version}}`, and choose Text mode **Name**:

```promql
max by (version) (nodejs_version_info{job="prestige-hostel-local",instance=~"$instance"})
```

If Explore returns data but the panel does not, check its data source and selected instance. Revision 1 originally used the legacy `singlestat` visualization; its version label display may need updating in newer Grafana versions.

## Verification

```sh
npx jest tests/unit/metrics.test.js --runInBand
```

The integration test checks runtime version export, route grouping, unmatched requests, parser errors, latency observations, and scrape exclusion. Dashboard JSON is generated for import; its rendering has not been verified in the live Grafana UI.

References:
- https://grafana.com/grafana/dashboards/11159-nodejs-application-dashboard/
- https://grafana.com/api/dashboards/11159/revisions/1/download
- https://github.com/siimon/prom-client/tree/v15.1.3
