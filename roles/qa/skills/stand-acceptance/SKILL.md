---
name: stand-acceptance
description: Feature acceptance on a project's local docker stand — dev login to the shell, token minting, API and UI checks in the browser, logs and DB, service rebuild after edits. Use when a feature needs live acceptance — e.g. a spec-review verdict "unverifiable — check on a live environment" — when checking how a change behaves in the running system, or when the user says "check on the stand", "accept on the stand". The content is written in the team's working language; the stand is a local docker compose of a concrete project. Container, service and DB names are placeholders `<project>`/`<service>`/`<db>`.
---

# Acceptance on the stand (docker compose, project `<project>`)

Live acceptance of the implementation: the spec-review verdict "unverifiable —
check on a live environment" is verified here. The stand is a local docker
compose; the credentials, paths and container/service/DB names of the concrete
machine live in environment variables / personal settings — the plugin holds
none of them (placeholders `<...>`).

The skill is deliberately command- and project-specific (the stand of a concrete
project, Windows wrappers) — a conscious exception to the plugin's portability
rule; do not generalize it to other projects.

## 1. Shell login (localhost:3000)

The shell does not let you in on its own: you need a token in localStorage **and** a cookie.

```bash
# admin token (role admin, all permissions) — mint it in the IAM container, TTL 24h
# <admin-user-id> — the id of the stand's dev admin
docker exec <project>-svc-iam python -c "
import auth.tokens as t
cfg = t.get_auth_settings(); cfg.jwt_access_ttl_minutes = 1440
print(t.create_access_token(user_id='<admin-user-id>', display_name='System Administrator', roles=['admin'], permissions=['<perm_read>','<perm_manage>']))
"
```

In the browser (the host's browser automation → evaluate script), a tab at
`http://localhost:3000/login`:

```js
const r = await fetch('/api/iam/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:'<dev-admin>',password:'<dev-admin-password>'}) });
const b = await r.json();
localStorage.setItem('<app>-token', b.access_token);
localStorage.setItem('<app>-auth-method', 'local');
document.cookie = '<app>-token=' + b.access_token + '; path=/; domain=localhost; max-age=86400; SameSite=Lax';
```

Nuances:
- A token minted in a **different** service is invalidated after that service's
  login → the shell logs out after ~10 s (`GET /api/iam/auth/me` → 401 → redirect
  to `/login`). Mint in the same service that issued the current session
  (IAM is the universal option).
- `localStorage.setItem` after a user login erases their session — do not clear
  the storage if the user is already logged in.
- `POST /api/iam/auth/login` with dev credentials works only in the shell's dev
  mode (turned off in production).

## 2. Calling services directly (inside the container)

```bash
docker exec <project>-svc-<service> python -c "
import asyncio, httpx
from auth.tokens import create_access_token
tok = create_access_token(user_id='...', roles=['admin'], permissions=['<perm_read>'])
async def m():
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.get('http://localhost:8000/api/v1/...', headers={'Authorization': f'Bearer {tok}'})
        print(r.status_code, r.text[:400])
asyncio.run(m())
"
```

- Services talk over the internal ports of the compose network (`<service>` — 8000, the rest — by name).
- External services require Bearer — the engine's internal authorization utility
  provides a service token (search for `_auth_utils` / `get_*_auth*`).

## 3. Browser acceptance

- The host's browser automation (navigate) — open the page URL.
- Evaluate script — capture the state: `document.querySelectorAll('table tbody tr').length`,
  selectors, `document.body.innerText`.
- List network requests — what went to the API; the response body of a request by its id
  (matters when the UI shows something other than what the API returned).
- The UI state often depends on query parameters (a date, an object id):
  `?<entity>_id=…&date=YYYY-MM-DD` — pick them to fit the scenario, otherwise the
  default screen opens (e.g. the "approved" version instead of the working one).

## 4. Logs and DB

```bash
docker logs <project>-svc-<service> --tail 400 | grep '"status_code": 4\|"status_code": 5'
docker exec <project>-postgres psql -U <db-user> -d <db-1> -c "select ..."
docker exec <project>-postgres psql -U <db-user> -d <db-2> -c "select ..."
docker exec <project>-postgres psql -U <db-user> -d <db-3> -c "select ..."
```

## 5. Rebuilding a service after edits

```bash
cd <path-to>/infra && docker compose -f docker-compose.yml -f docker-compose.local.yml build <service> && docker compose -f docker-compose.yml -f docker-compose.local.yml up -d <service>
# wait for healthy
```

## 6. Service tests

```bash
cmd.exe /c "cd /d <repo>\backend\services\<service> && .venv\Scripts\python.exe -m pytest tests -q"
```

- `.venv\Scripts\*.exe` does not run from a POSIX shell — hence the wrapper
  `cmd.exe /c "cd /d <path> && ..."`.
- DB tests: `export <SERVICE>_TEST_DSN=postgresql+asyncpg://<db-user>:<password>@127.0.0.1:5432/<db>_test`
  (export in the shell, inherited by cmd); a trailing space in the value breaks the DSN.
- The test DB may sit on an old revision → `alembic upgrade head` with `DATABASE_URL`
  pointing at it; if the schema is "half-broken" — drop/create and migrate from scratch.

## 7. Acceptance report

Each acceptance check lands as one line — **PASS / FAIL + evidence**: the command, URL,
or artifact and what exactly was observed (output, status, row count, screenshot).
"Works" without an observation is not a check.

- Verdict — **READY / NOT READY** over all lines: one FAIL on a criterion is NOT READY,
  unless the user explicitly accepted the risk — record that acceptance next to the line.
- **Local green is not stand acceptance**: a passing pytest (section 6) or a green local
  build earns nothing here — only what was observed on the stand counts toward the verdict.
- What could not be checked is named with what is missing — an open item, never a silent PASS.

---

Moved from a command skill (2026-11-06): personal paths and names replaced with `<placeholders>`.
