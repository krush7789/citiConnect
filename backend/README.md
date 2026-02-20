# CitiConnect Backend

## Scheduler Configuration

The background scheduler is controlled by the `ENABLE_SCHEDULER` environment variable.

- `ENABLE_SCHEDULER=true` (default): startup attempts to run scheduled jobs.
- `ENABLE_SCHEDULER=false`: scheduler startup is skipped.

If scheduler is enabled but APScheduler is not installed, the server will continue to start and log a warning.

Install dependency:

```bash
pip install apscheduler
```

Disable in local/dev (`.env`):

```env
ENABLE_SCHEDULER=false
```

## Frontend/Backend Contract Smoke

Run this from the repository root to verify `frontend/src/api/services.js` calls map to real backend routes:

```bash
python backend/scripts/contract_smoke.py
```
