# Audit Findings — Implementation Fix Plan

## Critical (Must fix before any production deployment)

### #1 — Hardcoded default JWT secret (`config.py:51`)
**Issue**: `jwt_secret = "ginie-local-dev-secret-change-in-production"` is a known-string default.  
**Fix**:
- Remove default value; make `jwt_secret` required (no default) or generate a random one at startup.
- Add startup validation: if `CANTON_ENVIRONMENT != sandbox` and secret is default → refuse to start.
- Read from env `JWT_SECRET` only.
**Effort**: ~15 min

### #2 — `alg=none` JWT with no env guard (`canton_client_v2.py:15`)
**Issue**: Unsigned JWT (`alg: none`) is used for Canton sandbox auth with no check that we're actually in sandbox mode.  
**Fix**:
- Guard `make_sandbox_jwt()` with `assert settings.canton_environment == "sandbox"`.
- For devnet/mainnet, require a real signed token from env `CANTON_TOKEN`.
- Log a warning if `alg=none` is used.
**Effort**: ~20 min

### #3 — CORS wildcard `"*"` (`main.py:53`)
**Issue**: `allow_origins=["*"]` allows any domain to call the API.  
**Fix**:
- Read allowed origins from env `CORS_ORIGINS` (comma-separated).
- Default to `["http://localhost:3000", "https://canton.ginie.xyz"]` for dev.
- Remove wildcard `"*"`.
**Effort**: ~10 min

---

## High (Fix before beta / multi-user)

### #4 — No rate limiting on `/generate`, `/auth` (`routes.py`)
**Issue**: Anyone can spam contract generation (expensive LLM calls) or auth endpoints.  
**Fix**:
- Add `slowapi` dependency with Redis or in-memory backend.
- `/generate`: 5 req/min per IP.
- `/auth/*`: 10 req/min per IP.
- `/iterate`: 10 req/min per IP.
- Return `429 Too Many Requests` with `Retry-After` header.
**Effort**: ~45 min

### #5 — Canton token not validated at startup (`deploy_agent.py:30`)
**Issue**: For non-sandbox envs, `CANTON_TOKEN` is used but never checked for validity at startup.  
**Fix**:
- On startup (in `lifespan`), if env is devnet/mainnet, validate `CANTON_TOKEN` is set and non-empty.
- Optionally make a lightweight `/v1/parties` call to verify the token works.
**Effort**: ~20 min

### #6 — Daemon threads lost on crash (Celery unused) (`routes.py:256`)
**Issue**: Background jobs run as daemon threads; if the process crashes, jobs are lost silently.  
**Fix**:
- Phase 1 (quick): Add `try/except` with error logging + job status update to `"failed"` in thread.
- Phase 2 (proper): Activate Celery worker with Redis broker (already configured but unused).
- Add a `/health` check that reports active background thread count.
**Effort**: ~1 hr (phase 1), ~2 hr (phase 2)

### #7 — Multi-worker `_in_memory_jobs` race condition (`routes.py:141`)
**Issue**: `_in_memory_jobs` is a plain dict shared across threads with no locking.  
**Fix**:
- Replace with `threading.Lock`-guarded dict, or
- Use Redis as the job store (already have Redis client), or
- Use `concurrent.futures.Future`-based pattern.
- Short-term: wrap all reads/writes to `_in_memory_jobs` with a `threading.Lock`.
**Effort**: ~30 min

---

## Medium (Fix for code quality / maintainability)

### #8 — Sync HTTP in async handlers (`ledger_routes.py`)
**Issue**: `httpx.Client` (sync) is used inside FastAPI route handlers which should be async.  
**Fix**:
- Replace `httpx.Client` with `httpx.AsyncClient`.
- Change route handlers to `async def`.
- Use `await client.get(...)` / `await client.post(...)`.
**Effort**: ~1 hr

### #9 — `datetime.utcnow()` deprecated (12+ uses) (`routes.py`)
**Issue**: `datetime.utcnow()` is deprecated in Python 3.12+.  
**Fix**:
- Replace all with `datetime.now(timezone.utc)`.
- Global find-replace across codebase.
**Effort**: ~15 min

### #10 — Template cache at source root (`ledger_routes.py:147`)
**Issue**: `.template_cache.json` is written next to source files.  
**Fix**:
- Move to a proper temp/data directory: `Path(tempfile.gettempdir()) / "ginie_template_cache.json"`.
- Or use `settings.chroma_persist_dir` parent.
**Effort**: ~10 min

### #11 — Imports inside function bodies (multiple files)
**Issue**: Deferred imports scattered inside functions hurt readability.  
**Fix**:
- Move to top-of-file imports where possible.
- Keep deferred imports only for genuine circular dependency breaks (document with comment).
**Effort**: ~30 min

### #12 — `print()` mixed with structlog (`routes.py`)
**Issue**: Some debug output uses `print()` instead of the structured logger.  
**Fix**:
- Replace all `print(...)` with `logger.debug(...)` or `logger.info(...)`.
**Effort**: ~15 min

---

## Info (Nice-to-have / cleanup)

### #13 — Dead code: `run_mvp_pipeline` + `DamlSandbox` (`orchestrator.py`)
**Issue**: Legacy functions/classes no longer called.  
**Fix**: Delete dead code and any associated imports.  
**Effort**: ~10 min

### #14 — Unused `daml_tools` imports (`orchestrator.py:13`)
**Issue**: Unused import.  
**Fix**: Remove the import line.  
**Effort**: ~2 min

### #15 — Polling vs. WebSocket for job status (frontend)
**Issue**: Frontend polls `/status/{id}` every N seconds instead of using WebSocket/SSE.  
**Fix** (Phase 2):
- Add a `/ws/status/{id}` WebSocket endpoint in FastAPI.
- Frontend subscribes and gets push updates.
- Fallback to polling for environments without WS support.
**Effort**: ~2-3 hr

### #16 — Relative `chroma_persist_dir` (`config.py:40`)
**Issue**: `"./rag/chroma_db"` is relative — breaks if working dir changes.  
**Fix**:
- Resolve to absolute path at startup: `Path(__file__).parent / "rag/chroma_db"`.
- Or read from env `CHROMA_PERSIST_DIR`.
**Effort**: ~10 min

### #17 — `create_all()` conflicts with Alembic (`main.py:22`)
**Issue**: `Base.metadata.create_all()` at startup may conflict with Alembic migration state.  
**Fix**:
- Remove `create_all()` from startup.
- Use Alembic migrations exclusively (`alembic upgrade head` on deploy).
- Keep `create_all()` only behind a `--init-db` flag or env var.
**Effort**: ~20 min

---

## Recommended Fix Order

| Sprint | Issues | Time Est. |
|--------|--------|-----------|
| **Sprint 1 (Security)** | #1, #2, #3, #5 | ~1 hr |
| **Sprint 2 (Stability)** | #4, #7, #9, #12 | ~1.5 hr |
| **Sprint 3 (Async/Quality)** | #6, #8, #10, #11 | ~2.5 hr |
| **Sprint 4 (Cleanup)** | #13, #14, #16, #17 | ~40 min |
| **Sprint 5 (Enhancement)** | #15 (WebSocket) | ~3 hr |
| **Total** | All 17 issues | **~8.5 hr** |
