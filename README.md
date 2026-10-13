# Request Bench

A small Node.js HTTP benchmark with bounded concurrency, complete-response timing, per-request deadlines, and percentile summaries. No dependencies.

Includes a local demo server, per-request JSON results, and tests against real HTTP servers.

## Try it locally

Requires Node.js 20 or newer. In one terminal:

```sh
node examples/server.mjs
```

In another:

```sh
node benchmark.mjs --url http://127.0.0.1:8080 --requests 30 --concurrency 4
node benchmark.mjs --url http://127.0.0.1:8080/fail --requests 5 --json
```

## Options

| Flag | Default | Purpose |
|---|---|---|
| `--url` | Required | HTTP(S) target |
| `--requests` | 30 | Total requests, 1–10,000 |
| `--concurrency` | 4 | Maximum concurrent requests, 1–64 |
| `--timeout-ms` | 2000 | Deadline for the whole response |
| `--json` | Off | Detailed results and individual samples |
| `--allow-remote` | Off | Opt into a non-loopback target |

Loopback-only mode is the default. Redirects are rejected, and URLs with embedded credentials are rejected. Exit status is 0 for all-success results, 1 when requests fail, and 2 for invalid usage.

## Measurements

Timing starts before each request and ends after the response body is consumed. The deadline includes body transfer. A result counts HTTP 2xx as successful; HTTP errors, network failures, and timeouts remain visible in the sample list. Percentiles use linear interpolation and include failed-request durations.

Throughput is total completed attempts divided by wall-clock duration. It is not a claim about a production service’s capacity. There is no warmup, connection-pool control, or distributed coordination, and a small sample can produce unstable percentiles.

## Test

```sh
npm test
```

Tests create real local HTTP servers to check concurrency limits, error accounting, and a slow-body timeout. Numeric tests verify percentiles without altering input order. No tests contact external services.

## Portfolio

More projects and background: [rayansh.dev](https://rayansh.dev/).
