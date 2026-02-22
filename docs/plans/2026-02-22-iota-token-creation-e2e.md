# IOTA Token Creation E2E Integration Plan

Created: 2026-02-22
Status: COMPLETE
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

**Goal:** Create a programmatic E2E testnet script in the umbrella `iota-token-creator` repo that exercises the full token creation user story for all 3 coin types (Simple, CoinManager, Regulated) against the IOTA testnet via the API, and outputs the IOTA Explorer URL for each published token contract.

**Architecture:** TypeScript script using `@iota/iota-sdk` for wallet/transaction operations and the API's `/api/v1/compile` endpoint for Move bytecode compilation. The script generates a testnet keypair, funds it from the faucet, compiles + publishes each coin type, and prints the explorer URL for each transaction.

**Tech Stack:** TypeScript, `@iota/iota-sdk`, `tsx` (runner), `vitest` (tests)

## Scope

### In Scope

- TypeScript project setup in the `iota-token-creator` umbrella repo
- API client module that calls `POST /api/v1/compile`
- IOTA publisher module that builds publish transactions, signs with a local keypair, and executes on testnet
- Main E2E runner script that creates all 3 coin types and outputs explorer URLs
- Unit tests for the API client and publisher modules
- Configuration via environment variables (API URL, testnet RPC, faucet URL)

### Out of Scope

- Browser-based E2E tests (Cypress/Playwright with wallet extension)
- Changes to `iota-token-creator-web` or `iota-token-creator-api` source code
- Minting tokens after deployment (the script deploys the contract; minting is a separate step)
- Icon upload via IPFS (not required for contract deployment)
- CI/CD pipeline integration

## Prerequisites

- Docker Compose running the API: `docker compose -f ../iota-token-creator-api/docker-compose.yml up -d`
- API accessible at `http://localhost:8090` (default docker-compose port mapping)
- Node.js >= 18 (for native fetch and the IOTA SDK)
- Internet access to IOTA testnet RPC and faucet

## Context for Implementer

- **Patterns to follow:** The web frontend's `use-publish-token.ts:28-69` shows the exact transaction building pattern — compile via API, build `Transaction` with `.publish()`, transfer `upgradeCap` to sender. Our script replicates this programmatically.
- **Conventions:** The API expects `CreateTokenRequest` JSON at `POST /api/v1/compile` with fields: `name`, `symbol`, `decimals`, `description`, `iconUrl`, `totalSupply`, `maxSupply`, `coinType`. The `coinType` must be one of: `"simple"`, `"coinManager"`, `"regulated"`.
- **Key files:**
  - `iota-token-creator-api/pkg/models/token.go` — request/response types
  - `iota-token-creator-web/src/hooks/use-publish-token.ts` — reference transaction building pattern
  - `iota-token-creator-web/src/lib/networks.ts` — network config and explorer URLs
  - `iota-token-creator-api/internal/handler/networks.go` — API network data including explorer URLs
- **Gotchas:**
  - `totalSupply` and `maxSupply` are accepted by the API but NOT used during compilation. The Move templates don't reference them. Minting happens separately via TreasuryCap after deployment.
  - The API's Docker container includes the IOTA CLI and pre-warmed Move framework cache. The CLI is NOT installed locally.
  - The `CompileResponse.digest` field is an array of ints (not the transaction digest). The transaction digest comes from the IOTA network after publishing.
  - The web frontend `.env.local` uses port 8090 for API; docker-compose maps `8090:8080`.

## Runtime Environment

- **API start command:** `docker compose -f ../iota-token-creator-api/docker-compose.yml up -d`
- **API port:** 8090 (mapped from container 8080)
- **Health check:** `curl http://localhost:8090/healthz`
- **IOTA Testnet RPC:** `https://api.testnet.iota.cafe`
- **IOTA Testnet Faucet:** `https://faucet.testnet.iota.cafe`
- **IOTA Testnet Explorer:** `https://explorer.iota.org/testnet`

## Progress Tracking

**MANDATORY: Update this checklist as tasks complete. Change `[ ]` to `[x]`.**

- [x] Task 1: Initialize TypeScript project
- [x] Task 2: Implement API client module
- [x] Task 3: Implement IOTA publisher module
- [x] Task 4: Create main E2E runner script
- [x] Task 5: Add npm scripts and run verification

**Total Tasks:** 5 | **Completed:** 5 | **Remaining:** 0

## Implementation Tasks

### Task 1: Initialize TypeScript Project

**Objective:** Set up the TypeScript project in the `iota-token-creator` umbrella repo with all dependencies needed for the E2E testnet script.

**Dependencies:** None

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `.gitignore`

**Key Decisions / Notes:**

- Use `tsx` as the TypeScript runner (fast, no build step needed)
- Use `vitest` for unit tests (consistent with the web project)
- Use `@iota/iota-sdk` for all IOTA operations (same SDK the web frontend uses)
- Use native `fetch` (Node 18+) instead of adding `node-fetch` dependency
- `.env.example` documents: `API_URL`, `IOTA_RPC_URL`, `IOTA_FAUCET_URL`, `IOTA_EXPLORER_URL`, optional `PRIVATE_KEY` (hex) for reusing a keypair

**Definition of Done:**

- [ ] `package.json` exists with `@iota/iota-sdk`, `tsx`, `vitest`, `dotenv` dependencies
- [ ] `tsconfig.json` configures ESM TypeScript with strict mode
- [ ] `.env.example` documents all required environment variables
- [ ] `.gitignore` excludes `node_modules/`, `.env`, `dist/`
- [ ] `pnpm install` succeeds without errors

**Verify:**

- `cd /Users/yosefgamble/github/iota-token-creator && cat package.json | grep '@iota/iota-sdk'`
- `cd /Users/yosefgamble/github/iota-token-creator && pnpm install`

---

### Task 2: Implement API Client Module

**Objective:** Create a typed API client that calls the `POST /api/v1/compile` endpoint to compile Move bytecode for a given token configuration.

**Dependencies:** Task 1

**Files:**

- Create: `e2e/lib/api-client.ts`
- Create: `e2e/lib/types.ts`
- Create: `e2e/__tests__/api-client.test.ts`

**Key Decisions / Notes:**

- `types.ts` mirrors the API's `CreateTokenRequest` and `CompileResponse` types
- `api-client.ts` exports a `compileToken(apiUrl, request)` function
- The function throws a descriptive error on non-2xx responses, including the API error message
- Follow the same type structure as `iota-token-creator-web/src/types/token.ts:15-31` and `iota-token-creator-web/src/lib/api.ts:4-15`
- Tests mock `global.fetch` to verify request shape and error handling

**Definition of Done:**

- [ ] `compileToken()` sends correct JSON to `/api/v1/compile` and returns typed `CompileResponse`
- [ ] Throws descriptive error on non-2xx response including API error message
- [ ] Unit tests verify: correct request body, successful response parsing, error handling for 4xx/5xx
- [ ] All tests pass

**Verify:**

- `cd /Users/yosefgamble/github/iota-token-creator && pnpm vitest run e2e/__tests__/api-client.test.ts`

---

### Task 3: Implement IOTA Publisher Module

**Objective:** Create a module that generates/loads an IOTA keypair, funds it from the testnet faucet, and publishes compiled Move bytecode as an on-chain package.

**Dependencies:** Task 1

**Files:**

- Create: `e2e/lib/publisher.ts`
- Create: `e2e/__tests__/publisher.test.ts`

**Key Decisions / Notes:**

- Uses `Ed25519Keypair` from `@iota/iota-sdk/keypairs/ed25519` for key management
- Uses `IotaClient` from `@iota/iota-sdk/client` for RPC calls
- **Faucet strategy:** Use `requestIotaFromFaucetV0` (synchronous, hits `/gas` endpoint) from `@iota/iota-sdk/faucet` — it returns coins immediately without polling. If `requestIotaFromFaucetV0` is not available, manually POST to `https://faucet.testnet.iota.cafe/gas` with body `{"FixedAmountRequest":{"recipient":"<address>"}}`. Do NOT use V1 (async task-based) to avoid needing to poll faucet status. After the faucet call, poll account balance to confirm funds arrived before publishing.
- `publishPackage(client, keypair, compiled)` function:
  1. Builds a `Transaction` with `.publish({ modules, dependencies })`
  2. Transfers the `UpgradeCap` to the signer's address
  3. Signs and executes via `client.signAndExecuteTransaction()` with `options: { showEffects: true, showObjectChanges: true }`
  4. Wraps the call with `AbortSignal.timeout(60_000)` to prevent hanging on slow testnet RPC
  5. Waits for transaction finality via `client.waitForTransaction({ digest })` before returning
  6. Returns the transaction digest (always present as a top-level field in `IotaTransactionBlockResponse`)
- **Important:** `IotaClient.signAndExecuteTransaction` returns `IotaTransactionBlockResponse` with a required top-level `digest` field — this differs from the dApp Kit hook's optional shape. Do NOT copy the `'digest' in result` guard from the web frontend.
- `getExplorerUrl(explorerBase, digest)` builds the explorer URL: `${explorerBase}/txblock/${digest}`
- Follow the transaction-building pattern (`.publish()`, `.transferObjects()`) from `use-publish-token.ts:49-54`, but adapt the signing/execution for `IotaClient` direct usage
- Tests mock `IotaClient` and verify transaction construction

**Definition of Done:**

- [ ] `getOrCreateKeypair()` generates new keypair or loads from hex private key env var
- [ ] `fundFromFaucet()` requests testnet IOTA tokens for a given address
- [ ] `publishPackage()` builds publish transaction matching the web frontend's pattern, signs, waits for finality via `waitForTransaction()`, and returns digest
- [ ] `getExplorerUrl()` returns correct URL format `{explorer}/txblock/{digest}`
- [ ] Unit tests verify: keypair generation, explorer URL construction, transaction building logic
- [ ] All tests pass

**Verify:**

- `cd /Users/yosefgamble/github/iota-token-creator && pnpm vitest run e2e/__tests__/publisher.test.ts`

---

### Task 4: Create Main E2E Runner Script

**Objective:** Create the main orchestrator script that ties the API client and publisher together to create all 3 token types on the IOTA testnet and output explorer URLs.

**Dependencies:** Task 2, Task 3

**Files:**

- Create: `e2e/create-all-tokens.ts`
- Create: `e2e/lib/config.ts`

**Key Decisions / Notes:**

- The script performs a health check against the API (`GET /healthz`) with retries (max 30 attempts, 2s interval) before starting. This accounts for the API's dependency on IPFS health checks which can take 50+ seconds on first Docker start. If the health check fails after all retries, prints: `"API not available at {url}. Start it with: docker compose -f ../iota-token-creator-api/docker-compose.yml up -d --wait"`
- `config.ts` loads env vars with sensible defaults:
  - `API_URL` → `http://localhost:8090`
  - `IOTA_RPC_URL` → `https://api.testnet.iota.cafe`
  - `IOTA_FAUCET_URL` → `https://faucet.testnet.iota.cafe`
  - `IOTA_EXPLORER_URL` → `https://explorer.iota.org/testnet`
  - `PRIVATE_KEY` → optional hex string
- The script:
  1. Loads config from env
  2. Creates or loads keypair
  3. Funds keypair from testnet faucet
  4. Waits for balance to appear (poll with retry)
  5. Iterates over all 3 coin types with unique names:
     - Simple: `E2ESimple_<timestamp>` / `ESIM`
     - CoinManager: `E2EManaged_<timestamp>` / `EMGD`
     - Regulated: `E2EReg_<timestamp>` / `EREG`
  6. For each: compile → publish → print explorer URL
  7. Prints summary table at the end
- Uses timestamps in names to avoid module name collisions across runs
- Exits with code 0 on success, 1 on any failure
- Prints clear progress messages to stdout

**Definition of Done:**

- [ ] Script loads configuration from `.env` with sensible testnet defaults
- [ ] Checks API health with retries (max 30 attempts, 2s interval) before proceeding; exits with clear startup instructions on failure
- [ ] Creates/loads keypair and funds from testnet faucet
- [ ] Polls for non-zero IOTA balance with retry (at least 10 attempts, 3s apart) before publishing; exits with clear error if balance does not appear within 30 seconds
- [ ] Successfully compiles all 3 coin types via the API
- [ ] Publishes all 3 packages to the IOTA testnet
- [ ] Prints explorer URL for each: `https://explorer.iota.org/testnet/txblock/{digest}`
- [ ] Prints a summary table with coin type, name, symbol, and explorer URL
- [ ] On partial failure, prints all explorer URLs collected so far before exiting, including which coin type failed and why
- [ ] Exits with code 0 on full success, code 1 on any failure

**Verify:**

- `cd /Users/yosefgamble/github/iota-token-creator && pnpm tsx e2e/create-all-tokens.ts` (requires running API and testnet access)
- Output contains 3 explorer URLs matching `https://explorer.iota.org/testnet/txblock/`

---

### Task 5: Add NPM Scripts and Run Verification

**Objective:** Add convenience npm scripts and verify the entire flow works end-to-end.

**Dependencies:** Task 4

**Files:**

- Modify: `package.json`

**Key Decisions / Notes:**

- Add scripts:
  - `"test"`: `"vitest run"`
  - `"test:watch"`: `"vitest"`
  - `"e2e:testnet"`: `"tsx e2e/create-all-tokens.ts"`
  - `"e2e:testnet:dotenv"`: `"tsx -r dotenv/config e2e/create-all-tokens.ts"`
- Run the unit test suite to verify all tests pass
- Run the E2E script against the live testnet (requires API running)
- Capture the 3 explorer URLs from the output

**Definition of Done:**

- [ ] All unit tests pass via `pnpm test`
- [ ] `pnpm run e2e:testnet` successfully creates 3 tokens on testnet
- [ ] 3 IOTA Explorer URLs are printed to stdout
- [ ] Each URL follows the format `https://explorer.iota.org/testnet/txblock/{digest}` where digest is the actual transaction digest returned by the IOTA network

**Verify:**

- `cd /Users/yosefgamble/github/iota-token-creator && pnpm test`
- `cd /Users/yosefgamble/github/iota-token-creator && pnpm run e2e:testnet`

## Testing Strategy

- **Unit tests:** API client (mocked fetch), publisher utilities (mocked IOTA SDK), config loading, explorer URL construction
- **Integration/E2E:** The main `create-all-tokens.ts` script IS the E2E test — it exercises the real API and testnet
- **Manual verification:** Open each explorer URL in a browser to confirm the transaction is visible

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| IOTA testnet faucet rate-limited or down | Medium | High | Add retry with exponential backoff for faucet requests; allow pre-funded keypair via `PRIVATE_KEY` env var |
| API Docker container not running | Medium | High | Script checks API health (`/healthz`) before starting and prints clear error message with startup command |
| Testnet RPC timeout during publish | Low | Medium | Set generous timeout (60s) on transaction execution; retry once on timeout |
| Module name collision on testnet | Low | Low | Use timestamp-based unique names for each run |
| `@iota/iota-sdk` faucet API differs from Sui pattern | Medium | Medium | Use manual HTTP POST to `https://faucet.testnet.iota.cafe/gas` with `{FixedAmountRequest:{recipient}}` as fallback if SDK faucet module unavailable |
| Stale Move framework cache in Docker image | Low | High | If API returns "compilation framework error", print: "Move framework cache may be stale. Rebuild with: docker compose build --no-cache api" |

## Goal Verification

> Derived from the plan's goal using goal-backward methodology.

### Truths (what must be TRUE for the goal to be achieved)

- Running `npm run e2e:testnet` creates a Simple coin on the IOTA testnet and outputs its explorer URL
- Running `npm run e2e:testnet` creates a CoinManager coin on the IOTA testnet and outputs its explorer URL
- Running `npm run e2e:testnet` creates a Regulated coin on the IOTA testnet and outputs its explorer URL
- Each explorer URL follows the format `https://explorer.iota.org/testnet/txblock/{digest}` and points to a valid transaction
- The script exercises the same compile → publish flow that the web frontend uses

### Artifacts (what must EXIST to support those truths)

- `e2e/create-all-tokens.ts` — main runner script that orchestrates all 3 coin type creations
- `e2e/lib/api-client.ts` — calls the API compile endpoint
- `e2e/lib/publisher.ts` — builds, signs, and publishes IOTA transactions
- `e2e/lib/config.ts` — loads environment configuration
- `e2e/lib/types.ts` — shared TypeScript types
- `e2e/__tests__/api-client.test.ts` — unit tests for API client
- `e2e/__tests__/publisher.test.ts` — unit tests for publisher

### Key Links (critical connections that must be WIRED)

- `create-all-tokens.ts` calls `compileToken()` from `api-client.ts` for each coin type → receives `CompileResponse` with `modules` and `dependencies`
- `create-all-tokens.ts` calls `publishPackage()` from `publisher.ts` with the compiled output → receives transaction digest
- `publishPackage()` builds `Transaction.publish({ modules, dependencies })` matching the web frontend's pattern in `use-publish-token.ts:49-54`
- `getExplorerUrl()` constructs the URL using the same pattern as `transaction-result.tsx:20`

## Open Questions

- Whether the IOTA testnet requires gas payment for publish transactions (likely yes, hence faucet funding)

### Deferred Ideas

- CI/CD pipeline integration (GitHub Actions running this on schedule)
- Browser-based E2E test with Cypress and wallet extension mock
- Post-deployment minting verification (call the `mint` entry function after publishing)
