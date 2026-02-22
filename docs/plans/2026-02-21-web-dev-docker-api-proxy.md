# Web Dev Docker API Proxy Implementation Plan

Created: 2026-02-21
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No

> **Status Lifecycle:** PENDING → COMPLETE → VERIFIED
> **Iterations:** Tracks implement→verify cycles (incremented by verify phase)
>
> - PENDING: Initial state, awaiting implementation
> - COMPLETE: All tasks implemented
> - VERIFIED: All checks passed
>
> **Approval Gate:** Implementation CANNOT proceed until `Approved: Yes`
> **Worktree:** Set at plan creation (from dispatcher). `Yes` uses git worktree isolation; `No` works directly on current branch (default)

## Summary

**Goal:** Add a unified dev command to the web repo that builds and starts the Docker API (from the sibling `iota-token-creator-api` repo) and the Next.js dev server together. Allow overriding the API URL via env var for external/remote APIs.

**Architecture:** A shell script (`scripts/dev-full.sh`) orchestrates Docker Compose in the sibling API repo and the Next.js dev server. npm scripts in `package.json` provide the interface. The existing `NEXT_PUBLIC_API_URL` env var controls where the web app points — defaulting to `http://localhost:8080` (Docker) but overridable for remote APIs.

**Tech Stack:** Bash script, Docker Compose, Next.js, pnpm scripts

## Scope

### In Scope

- Shell script to start Docker API + Next.js dev server in one command
- npm scripts for `dev:full`, `dev:api`, `dev:api:down`
- Graceful cleanup (stop Docker API on script exit)
- Health check wait (API must be up before web starts)
- Documentation in `.env.example` for external URL override
- Error handling (missing Docker, missing sibling repo, API build failure)

### Out of Scope

- Changing how the web app calls the API (keeps `NEXT_PUBLIC_API_URL` + direct fetch)
- Adding a Next.js rewrite/proxy layer
- Dockerizing the web app itself
- Changes to the API repo
- CI/CD changes

## Prerequisites

- Docker and Docker Compose installed locally
- The `iota-token-creator-api` repo cloned as a sibling directory (`../iota-token-creator-api`)
- API repo has a valid `.env` file (or `.env.example` values are sufficient for local dev)

## Context for Implementer

> This section is critical for cross-session continuity.

- **Patterns to follow:** The web repo uses pnpm as package manager (`package.json:59` has `"packageManager": "pnpm@10.0.0"`). Dev command is `next dev --turbopack`.
- **Conventions:** Scripts go in `scripts/` directory (doesn't exist yet in web repo). npm scripts are the entry point for all dev commands.
- **Key files:**
  - `iota-token-creator-web/package.json` — npm scripts
  - `iota-token-creator-web/.env.example` — env var documentation
  - `iota-token-creator-web/.env.local` — local env overrides (gitignored)
  - `iota-token-creator-web/src/lib/constants.ts:35` — `API_BASE_URL` definition reads from `NEXT_PUBLIC_API_URL`
  - `iota-token-creator-api/docker-compose.yml` — API Docker services (api, jaeger, ipfs)
- **Gotchas:**
  - The Docker Compose file uses `version: "3.9"` (deprecated in newer Docker Compose, but still works)
  - The API depends on `ipfs` and `jaeger` services, which must be healthy before API starts
  - The API health endpoint is `/healthz` (not `/health`)
  - CORS is configured in the API to allow `http://localhost:3000` by default
- **Domain context:** The API is a Go service that compiles IOTA Move smart contracts and uploads icons to IPFS. The web app is a Next.js frontend that calls two API endpoints: `POST /api/v1/compile` and `POST /api/v1/upload-icon`.

## Runtime Environment

- **Web start command:** `pnpm dev` (runs `next dev --turbopack` on port 3000)
- **API start command:** `docker compose up` in `../iota-token-creator-api/` (exposes port 8080)
- **API health check:** `curl http://localhost:8080/healthz`
- **Web port:** 3000
- **API port:** 8080

## Progress Tracking

**MANDATORY: Update this checklist as tasks complete. Change `[ ]` to `[x]`.**

- [x] Task 1: Create dev orchestration script
- [x] Task 2: Add npm scripts and update env documentation
- [x] Task 3: Verify the full dev workflow

**Total Tasks:** 3 | **Completed:** 3 | **Remaining:** 0

## Implementation Tasks

### Task 1: Create dev orchestration script

**Objective:** Create a shell script that starts the Docker API services from the sibling repo and the Next.js dev server, with proper error handling and cleanup.

**Dependencies:** None

**Files:**

- Create: `iota-token-creator-web/scripts/dev-full.sh`

**Key Decisions / Notes:**

- Script should be POSIX-compatible bash (#!/usr/bin/env bash)
- Use `docker compose -f ../iota-token-creator-api/docker-compose.yml` to reference the API repo as-is
- Wait for API health (`/healthz`) before starting Next.js dev server (poll with timeout)
- Trap SIGINT/SIGTERM to stop Docker services on exit (or offer `--no-teardown` flag to leave them running)
- Check for: Docker daemon running, sibling repo exists, docker-compose.yml exists
- Allow `API_URL` env var override: if `NEXT_PUBLIC_API_URL` is set to something other than `localhost:8080`, skip Docker startup and just run Next.js
- Pass any remaining arguments through to `next dev` (e.g., `--port 3001`)

**Definition of Done:**

- [ ] Script starts Docker API services from sibling repo
- [ ] Script waits for API health check before starting Next.js
- [ ] Script cleans up Docker services on SIGINT/exit
- [ ] Script errors with clear message if Docker is not available
- [ ] Script errors with clear message if sibling API repo is not found
- [ ] Script skips Docker startup when `NEXT_PUBLIC_API_URL` points to a non-localhost URL
- [ ] Script is executable (`chmod +x`)

**Verify:**

- `bash scripts/dev-full.sh --help` shows usage (or script runs without error)
- `file scripts/dev-full.sh` confirms it's a shell script

### Task 2: Add npm scripts and update env documentation

**Objective:** Add convenience npm scripts to `package.json` and update `.env.example` with documentation for the different dev modes.

**Dependencies:** Task 1

**Files:**

- Modify: `iota-token-creator-web/package.json`
- Modify: `iota-token-creator-web/.env.example`

**Key Decisions / Notes:**

- Add these npm scripts:
  - `"dev:full": "bash scripts/dev-full.sh"` — starts Docker API + web dev server
  - `"dev:api": "docker compose -f ../iota-token-creator-api/docker-compose.yml up -d --build"` — start Docker API only (detached)
  - `"dev:api:down": "docker compose -f ../iota-token-creator-api/docker-compose.yml down"` — stop Docker API
  - `"dev:api:logs": "docker compose -f ../iota-token-creator-api/docker-compose.yml logs -f api"` — tail API logs
- Update `.env.example` with comments explaining:
  - Default: `http://localhost:8080` for Docker API
  - Override: set to any URL for remote/staging API

**Definition of Done:**

- [ ] `pnpm dev:full` starts both Docker API and web dev server
- [ ] `pnpm dev:api` starts Docker API in detached mode
- [ ] `pnpm dev:api:down` stops Docker API
- [ ] `pnpm dev:api:logs` tails API container logs
- [ ] `.env.example` documents API URL configuration with examples

**Verify:**

- `pnpm run --list` shows the new scripts
- `cat .env.example` shows updated documentation

### Task 3: Verify the full dev workflow

**Objective:** End-to-end verification that both dev modes work: full local Docker mode and external URL override mode.

**Dependencies:** Task 1, Task 2

**Files:**

- No new files

**Key Decisions / Notes:**

- Test 1: Run `pnpm dev:full`, verify both services start, web can reach API
- Test 2: Set `NEXT_PUBLIC_API_URL=http://example.com:9999` and run `pnpm dev`, verify Docker is NOT started
- Test 3: Run `pnpm dev:api` then `pnpm dev` separately, verify they work together
- Ctrl+C the full dev script, verify Docker services are cleaned up

**Definition of Done:**

- [ ] `pnpm dev:full` starts API Docker + web dev server successfully
- [ ] API health check passes at `http://localhost:8080/healthz`
- [ ] Ctrl+C on `dev:full` stops Docker API services
- [ ] `pnpm dev:api` + `pnpm dev` works as a two-terminal workflow
- [ ] External URL override skips Docker startup

**Verify:**

- `curl http://localhost:8080/healthz` returns 200 after `dev:full`
- `docker compose -f ../iota-token-creator-api/docker-compose.yml ps` shows services running

## Testing Strategy

- **Unit tests:** Not applicable — this is a shell script + npm config change
- **Integration tests:** Manual verification via Task 3
- **Manual verification:** Run `dev:full`, confirm API is reachable, confirm cleanup on exit

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Sibling API repo not at expected path | Med | High | Script checks for `../iota-token-creator-api/docker-compose.yml` and exits with a clear error message including the expected path |
| Docker not installed or not running | Low | High | Script checks `docker info` and exits with instructions to install/start Docker |
| Port 8080 already in use | Low | Med | Script checks if port 8080 is in use before starting Docker and warns the user |
| API Docker build fails | Low | Med | Script captures build output and displays it; exits with non-zero status |
| API health check times out | Low | Med | Script uses a 60-second timeout with retries; exits with actionable error if API never becomes healthy |

## Open Questions

- None — requirements are clear.

### Deferred Ideas

- Add a Next.js rewrite proxy so the web app proxies API calls server-side (avoids CORS, hides API URL from client). This would be a separate enhancement.
- Dockerize the web app itself for a fully containerized dev environment.
- Create a monorepo setup with a root docker-compose that orchestrates both services.
