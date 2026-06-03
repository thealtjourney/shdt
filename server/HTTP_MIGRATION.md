# Migrating enrichment scripts off subprocess+curl

The codebase historically called external HTTP APIs via `subprocess.run(["curl", ...])`
because macOS LibreSSL 2.8.3 breaks Python's `requests`/`httpx` SSL
handshake against some endpoints. That workaround is unnecessary on Linux
containers (which is where Azure runs), and slow in production:

- ~30–50ms subprocess overhead per call
- Cannot run in parallel without many subprocesses
- Brittle response parsing (status code by string-splitting stdout)

`server/http_client.py` provides drop-in replacements:

```python
from http_client import http_post_json, http_get_json

result = http_post_json(url, {"foo": "bar"}, timeout=15)
if result["success"]:
    data = result["data"]
```

Behaviour by environment:

| Environment | Backend | How chosen |
|---|---|---|
| Azure Container Apps / Linux | httpx | Default (no LibreSSL) |
| GitHub Actions CI | httpx | Default |
| macOS dev (system Python) | httpx, curl fallback | Auto: tries httpx first |
| macOS dev (LibreSSL Python) | curl | Auto-falls back on first SSL fail |
| Forced | httpx \| curl | `HTTP_BACKEND=httpx \| curl` |

## Migration done

- `enrich_postcodes.py` — reference migration. Was 80 lines of subprocess
  parsing; now ~10 lines using `http_post_json`.

## Migration checklist

Each script below has at least one `subprocess.run(["curl", ...])` block
to replace with `http_post_json` or `http_get_json`. Pattern is identical
to `enrich_postcodes.py`. Order of priority:

- [x] `enrich_postcodes.py`  — POSTs batch of postcodes
- [ ] `enrich_crime.py`      — GETs crime stats per postcode (rate-limited)
- [ ] `enrich_flood.py`      — GETs EA WFS flood data
- [ ] `enrich_forecast.py`   — GETs Open-Meteo + EA forecast
- [ ] `enrich_broadband.py`  — file download (use httpx streaming or keep curl for big files)
- [ ] `enrich_imd.py`        — file download (CSV from gov.uk)
- [ ] `enrich_uprn.py`       — file download (35MB CSV)
- [ ] `enrich_epc.py`        — auth'd GET to opendatacommunities.org
- [ ] `enrich_all.py`        — orchestrator only, no direct HTTP

## Why not change them all at once?

The migration is mechanical but the behavioural surface is large — rate
limits, retries, error encoding, batching. Doing one script at a time
with verification (run it locally, confirm the same number of records get
enriched, compare a sample) is the only safe path.

## Testing the migration

Backend selection is controlled by `HTTP_BACKEND`. To verify both paths
work on the same machine:

```bash
HTTP_BACKEND=httpx ./enrich_data.sh         # production path
HTTP_BACKEND=curl  ./enrich_data.sh         # legacy path
```

Both should produce identical row counts.

## When to drop the curl path entirely

Once SHDT runs only in Azure / Linux, the curl fallback can be deleted
along with `subprocess` imports and the `_select_backend` logic. That's a
2-line change in `http_client.py`. Keep the curl path until then so
LibreSSL macOS dev environments still work.
