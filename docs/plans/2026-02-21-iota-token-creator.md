# IOTA Token Creator Implementation Plan

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

**Goal:** Build an IOTA Token Creator platform — two separate codebases (NextJS frontend + Go backend) — enabling users to create custom tokens (Simple Coins, CoinManager-managed Coins, and Regulated Coins) on the IOTA Rebased network. Similar in concept to Cardano native token creators like cardano-native-token.com.

**Architecture:** The Go backend acts as a stateless Move module compilation service + IPFS uploader. It generates Move source code from templates based on user-provided token parameters, compiles them using `iota move build --dump-bytecode-as-base64`, and returns the bytecode. The NextJS frontend connects to user IOTA wallets via `@iota/dapp-kit`, sends token parameters to the backend, receives compiled bytecode, and creates a `tx.publish()` transaction that the user signs with their wallet.

**Tech Stack:**
- **Frontend:** NextJS 15, TypeScript, Tailwind CSS (Material Design 3), `@iota/dapp-kit`, `@iota/iota-sdk`, Vitest + React Testing Library, Cypress E2E, Feather Icons (SVG), OpenTelemetry
- **Backend:** Go 1.25, standard library `net/http` + `chi` router, IOTA CLI for Move compilation, Pinata + self-hosted IPFS, Docker multi-stage builds, OpenTelemetry
- **Infrastructure:** Private GitHub repos, GitHub Actions CI/CD, Docker Compose (local IPFS node + IOTA testnet), dev/production modes for both

## Scope

### In Scope

- Three coin types: Simple (`create_currency`), CoinManager-managed (`coin_manager::create`), Regulated (`create_regulated_currency` with deny lists)
- Token creation wizard: name, symbol, decimals, description, icon upload, supply, max supply, coin type selection
- IOTA wallet connection (connect/disconnect, network selection: mainnet/testnet/devnet)
- Move module template generation + compilation via IOTA CLI
- IPFS icon upload (Pinata + self-hosted IPFS node option, configurable)
- Responsive mobile-first design with dark/light mode (Material Design 3 with Tailwind)
- Feather icons (SVG, no hardcoded colors, minified)
- Transaction building, signing, and result display with explorer links
- OpenTelemetry instrumentation for both codebases (error tracking + analytics)
- Dev and production modes for both frontend and backend
- Extensive test suites: Vitest unit tests, Cypress E2E (responsive), Go unit + integration tests with IOTA testnet Docker
- GitHub Actions CI/CD pipelines for both repos
- Private GitHub repos under personal account

### Out of Scope

- Token management dashboard (mint, burn, update metadata post-creation) — deferred for future iteration
- User authentication beyond wallet connection
- Database / persistent storage (backend is stateless)
- Production deployment infrastructure (Vercel, AWS, etc.) — CI/CD builds and tests only
- Mobile native apps
- Token trading / marketplace features

## Prerequisites

- IOTA CLI installed (for Move module compilation) — bundled in Docker
- Go 1.25 installed locally
- Node.js 20+ and pnpm installed locally
- Docker and Docker Compose installed
- GitHub CLI (`gh`) authenticated for repo creation
- Pinata account + JWT API key (for IPFS pinning) — free tier: 500 uploads, 1GB

## Runtime Environment

- **Go backend:** `make run` starts on port 8080 (configurable via `PORT` env var). Dev mode: verbose console logging. Production mode: JSON structured logging.
- **NextJS frontend:** `pnpm dev` starts on port 3000. Dev mode: hot reload enabled. Production: `pnpm build && pnpm start`.
- **Full local stack:** `docker compose up` in the API repo starts Go server (8080) + IPFS node (5001/8081) + Jaeger (16686).
- **Required env vars (backend):** `APP_ENV`, `PORT`, `CORS_ORIGINS`, `IPFS_PROVIDER`, `IPFS_API_URL`, `PINATA_JWT`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_ENABLED`
- **Required env vars (frontend):** `NEXT_PUBLIC_API_URL=http://localhost:8080`, `NEXT_PUBLIC_OTEL_ENABLED`
- **Health check:** `curl http://localhost:8080/api/health` returns `200 OK`
- **Frontend verify:** Open `http://localhost:3000` and verify landing page renders

## Context for Implementer

> This section is critical for cross-session continuity. Write it for an implementer who has never seen the codebase.

- **IOTA Token Creation Flow:** Creating tokens on IOTA Rebased requires publishing a Move module that uses the one-time witness pattern. The module's `init` function is called once at publish time, creating `TreasuryCap` and `CoinMetadata` objects. The `TreasuryCap` grants minting/burning authority.

- **Three Coin Types:**
  - **Simple Coin:** Uses `coin::create_currency(witness, decimals, symbol, name, description, icon_url, ctx)` in the init function. Returns `TreasuryCap` + `CoinMetadata`.
  - **CoinManager Coin:** Uses `coin_manager::create(witness, decimals, symbol, name, description, icon_url, ctx)`. Returns `CoinManagerTreasuryCap` + `CoinManagerMetadataCap` + `CoinManager` (shared object). IOTA-recommended approach with extra features (max supply, split permissions).
  - **Regulated Coin:** Uses `coin::create_regulated_currency(...)`. Returns `TreasuryCap` + `DenyCap` + `CoinMetadata` + `RegulatedCoinMetadata`. Enables deny list management via system object `0x403`.

- **Compilation Flow:**
  1. Go backend generates a Move package directory with `Move.toml` and source file
  2. `iota move build --dump-bytecode-as-base64 --path <package-dir>` compiles and outputs base64-encoded module bytecode
  3. Bytecode is returned to the frontend as JSON
  4. Frontend uses `tx.publish(modules, dependencies)` from `@iota/iota-sdk/transactions`
  5. User signs via their connected IOTA wallet (dApp Kit)

- **Key IOTA URLs:**
  - Mainnet RPC: `https://api.mainnet.iota.cafe`
  - Testnet RPC: `https://api.testnet.iota.cafe`
  - Devnet RPC: `https://api.devnet.iota.cafe`
  - Testnet Faucet: `https://faucet.testnet.iota.cafe`
  - Explorer: `https://explorer.iota.org/`

- **No Go SDK for Rebased IOTA:** The `iota.go` library is for the old (pre-rebased) IOTA. Rebased IOTA only has official TypeScript and Rust SDKs. The Go backend interacts with IOTA via CLI commands (for compilation) and standard HTTP calls to JSON-RPC (for chain queries if needed).

- **Move.toml Template:**
  ```toml
  [package]
  name = "<generated_package_name>"
  edition = "2024"

  [dependencies]
  Iota = { git = "https://github.com/iotaledger/iota.git", subdir = "crates/iota-framework/packages/iota-framework", rev = "framework/mainnet" }

  [addresses]
  <generated_package_name> = "0x0"
  ```

- **Gotchas:**
  - Move module struct name MUST match the module name (e.g., module `my_coin` must have struct `MY_COIN`)
  - The struct name must be ALL_CAPS with underscores matching the module name
  - One-time witness type must have `drop` ability only
  - Token symbol and name are passed as `b"bytes"` in Move
  - `icon_url` is `option::none()` if no icon, or `option::some(url::new_unsafe_from_bytes(b"https://..."))` if provided
  - IOTA CLI must be configured to the correct network before compilation

- **Security Critical:** User-provided values (name, symbol, description) are embedded into Move source code. ALL inputs must be sanitized to prevent Move source injection. Only alphanumeric characters, underscores, and spaces should be allowed in names. Descriptions must escape special characters.

## Progress Tracking

**MANDATORY: Update this checklist as tasks complete. Change `[ ]` to `[x]`.**

- [x] Task 1: Create private GitHub repos + frontend scaffolding
- [x] Task 2: Go backend scaffolding + Docker setup
- [x] Task 3: Move module templates + compilation service
- [x] Task 4: Backend IPFS integration + REST API endpoints
- [x] Task 5: Frontend layout, theme system + landing page
- [x] Task 6: Frontend IOTA wallet integration
- [x] Task 7: Frontend token creation form
- [x] Task 8: Frontend compilation + publish flow
- [x] Task 9: OpenTelemetry instrumentation (both codebases)
- [x] Task 10: Backend testing + IOTA testnet Docker
- [x] Task 11: Frontend testing (Vitest unit + Cypress E2E)
- [x] Task 12: GitHub Actions CI/CD for both repos

**Total Tasks:** 12 | **Completed:** 12 | **Remaining:** 0

## Implementation Tasks

### Task 1: Create Private GitHub Repos + Frontend Scaffolding

**Objective:** Create two private GitHub repositories and scaffold the NextJS frontend project with all tooling configured.

**Dependencies:** None

**Files:**

- Create: `iota-token-creator-web/` (separate repo)
  - `package.json`, `next.config.ts`, `tsconfig.json`
  - `postcss.config.js`
  - `.eslintrc.json`, `.prettierrc`
  - `vitest.config.ts`, `cypress.config.ts`
  - `src/app/layout.tsx`, `src/app/page.tsx`
  - `src/app/globals.css` (Tailwind + MD3 tokens)
  - `src/providers/theme-provider.tsx`
  - `src/lib/constants.ts`
  - `.env.example`, `.env.local`
  - `.gitignore`, `README.md`

**Key Decisions / Notes:**

- Use `pnpm` as package manager
- NextJS 15 with App Router
- Tailwind CSS v4 with CSS-based configuration (v4 uses `@theme` and `@import` directives in `globals.css` — **no `tailwind.config.ts` file**). MD3 design tokens defined as CSS custom properties (`--md-sys-color-primary`, etc.) and mapped to Tailwind via `@theme` block in `globals.css`
- Dark/light mode via `next-themes` with Tailwind `dark:` variant
- Feather Icons via `react-feather` package (renders SVGs inline, no hardcoded colors, styleable with Tailwind `text-*` classes)
- Configure ESLint with `eslint-config-next` + Prettier integration
- Configure Vitest with React Testing Library and jsdom environment
- Configure Cypress with base responsive viewport sizes
- `.env.local` includes `NEXT_PUBLIC_API_URL=http://localhost:8080` for local dev backend connection
- Repo name: `iota-token-creator-web`
- Private repo under user's personal GitHub account
- Create repos using `gh repo create --private`

**Definition of Done:**

- [ ] Private GitHub repo `iota-token-creator-web` exists on GitHub
- [ ] `pnpm dev` starts the NextJS dev server without errors
- [ ] `pnpm build` produces a production build without errors
- [ ] `pnpm lint` runs ESLint with zero errors
- [ ] `pnpm format:check` runs Prettier check with zero errors
- [ ] `pnpm test` runs Vitest with zero tests (setup verified)
- [ ] Dark/light mode toggle switches themes correctly
- [ ] Tailwind CSS classes render correctly in components

**Verify:**

- `cd iota-token-creator-web && pnpm install && pnpm build` — build succeeds
- `pnpm lint && pnpm format:check` — linting and formatting pass
- `pnpm test -- --run` — Vitest runs successfully (0 tests, no errors)

---

### Task 2: Go Backend Scaffolding + Docker Setup

**Objective:** Create the Go backend project with proper structure, dev/production modes, Docker setup with IOTA CLI, and basic health endpoint.

**Dependencies:** None

**Files:**

- Create: `iota-token-creator-api/` (separate repo)
  - `go.mod`, `go.sum`
  - `cmd/server/main.go` (entry point)
  - `internal/config/config.go` (dev/prod config via env vars)
  - `internal/server/server.go` (HTTP server setup)
  - `internal/server/routes.go` (route registration)
  - `internal/handler/health.go` (health check handler)
  - `internal/middleware/cors.go` (CORS middleware)
  - `internal/middleware/ratelimit.go` (rate limiting)
  - `internal/middleware/logging.go` (structured logging)
  - `Dockerfile` (multi-stage build with IOTA CLI)
  - `docker-compose.yml` (local dev with IPFS node)
  - `Makefile`
  - `.env.example`, `.gitignore`, `README.md`

**Key Decisions / Notes:**

- Go 1.25 with `chi` router (lightweight, idiomatic, stdlib-compatible)
- Config via environment variables: `APP_ENV` (development/production), `PORT`, `CORS_ORIGINS`, `RATE_LIMIT_RPS`, `IPFS_PROVIDER`, `IPFS_API_URL`, `PINATA_JWT`
- `.env.example` includes `CORS_ORIGINS=http://localhost:3000` for local frontend connection
- Structured JSON logging via `slog` (Go stdlib)
- Docker multi-stage: builder stage compiles Go binary, runtime stage includes IOTA CLI binary + compiled Go binary
- IOTA CLI installed in Docker via `brew` or direct binary download from GitHub releases
- Makefile targets: `build`, `run`, `test`, `lint`, `docker-build`, `docker-up`, `docker-down`
- Repo name: `iota-token-creator-api`
- Private repo under user's personal GitHub account
- Graceful shutdown on SIGTERM/SIGINT

**Definition of Done:**

- [ ] Private GitHub repo `iota-token-creator-api` exists on GitHub
- [ ] `make run` starts the server, `GET /api/health` returns `200 OK` with JSON response
- [ ] `make build` compiles the binary without errors
- [ ] Dev mode enables verbose logging; production mode uses JSON structured logs
- [ ] `docker compose up` starts the Go server + IPFS node
- [ ] CORS middleware allows configured origins
- [ ] Rate limiting middleware is functional

**Verify:**

- `cd iota-token-creator-api && make build` — binary compiles
- `make run & sleep 2 && curl http://localhost:8080/api/health` — returns 200 with health JSON
- `docker compose build` — Docker image builds with IOTA CLI included

---

### Task 3: Move Module Templates + Compilation Service

**Objective:** Create Go template engine that generates Move source code for all three coin types, integrates with IOTA CLI for compilation, and returns base64-encoded bytecode.

**Dependencies:** Task 2

**Files:**

- Create: `iota-token-creator-api/internal/move/templates/simple_coin.move.tmpl`
- Create: `iota-token-creator-api/internal/move/templates/managed_coin.move.tmpl`
- Create: `iota-token-creator-api/internal/move/templates/regulated_coin.move.tmpl`
- Create: `iota-token-creator-api/internal/move/templates/move_toml.tmpl`
- Create: `iota-token-creator-api/internal/move/generator.go` (template rendering)
- Create: `iota-token-creator-api/internal/move/compiler.go` (IOTA CLI integration)
- Create: `iota-token-creator-api/internal/move/sanitizer.go` (input sanitization)
- Create: `iota-token-creator-api/internal/move/types.go` (request/response types)
- Test: `iota-token-creator-api/internal/move/generator_test.go`
- Test: `iota-token-creator-api/internal/move/sanitizer_test.go`
- Test: `iota-token-creator-api/internal/move/compiler_test.go`

**Key Decisions / Notes:**

- Use Go `text/template` for Move source generation (NOT `html/template` — Move is not HTML)
- Each template generates a complete Move module with the one-time witness pattern
- **Simple Coin template** uses `coin::create_currency` in init, includes optional `mint` and `burn` functions
- **CoinManager Coin template** uses `coin_manager::create` in init, shares `CoinManager` object publicly, includes max supply option
- **Regulated Coin template** uses `coin::create_regulated_currency` in init, includes deny list management functions
- **Name derivation algorithm:** (1) lowercase, (2) replace spaces and hyphens with underscores, (3) strip all non-`[a-z0-9_]` chars, (4) strip leading digits/underscores, (5) truncate to 64 chars. Struct name = uppercase version of module name. Reject Move reserved keywords: `module`, `public`, `friend`, `fun`, `struct`, `use`, `let`, `mut`, `return`, `if`, `else`, `while`, `loop`, `break`, `continue`, `abort`, `true`, `false`, `has`, `as`. Test edge cases: leading numbers, all-special-chars, reserved keywords, empty result, Unicode
- Input sanitization is CRITICAL: module name must be valid Move identifier (lowercase, underscores only), symbol must be ASCII alphanumeric + underscore (uppercase), description must escape Move string literal characters. Description bytes must not contain unescaped quotes or backslashes
- **IMPORTANT: Verify IOTA CLI flags before implementation.** Run `iota move build --help` to confirm the exact flag name for bytecode dump (may be `--dump-bytecode-as-base64` or similar). Verify exact JSON output format by compiling a minimal test package. If the flag doesn't exist, investigate `iota client publish --dry-run` as an alternative. Document the verified flag and output schema
- Compiler creates a temporary directory under `/tmp/iota-compiler/` with Move.toml + source, runs the verified compilation flag, parses output, cleans up. Use `exec.CommandContext` with 60-second timeout to kill hung CLI processes. A cleanup goroutine runs on startup removing dirs older than 10 minutes from `/tmp/iota-compiler/`
- **Concurrency control:** Implement a bounded worker pool (max 5 concurrent compilations) using a semaphore. Each worker uses an isolated IOTA home directory (`IOTA_CONFIG_DIR=/tmp/iota-worker-{N}`) to prevent Move package cache corruption. Return HTTP 429 when queue is full
- **Docker cache warmup:** Dockerfile runs a dummy `iota move build` during image build to pre-cache the IOTA framework git dependency. All subsequent compilations use `--skip-fetch-latest-git-deps` flag to avoid re-cloning
- **Error sanitization:** Parse IOTA CLI stderr, strip absolute file paths and internal details. Return user-friendly error categories: 'Invalid token configuration', 'Compilation framework error', 'Internal error'. Log full error server-side for debugging
- **Verify CoinManager API:** Before writing templates, look up actual `coin_manager` module in IOTA framework source at `https://github.com/iotaledger/iota/blob/framework/mainnet/crates/iota-framework/packages/iota-framework/sources/coin_manager.move` to verify exact function signatures for `create`, return types, and required imports
- Move.toml `rev` field depends on target network: `framework/mainnet`, `framework/testnet`, `framework/devnet`

**Definition of Done:**

- [ ] All three Move module templates render valid Move source code
- [ ] Generated module names follow Move naming rules (lowercase, underscores)
- [ ] Input sanitizer rejects dangerous inputs (special chars, injection attempts)
- [ ] Compiler successfully calls `iota move build` and parses base64 output
- [ ] Compilation produces valid bytecode for all three coin types on testnet
- [ ] Unit tests cover template generation, sanitization, and compilation (mocked CLI)
- [ ] All tests pass with `go test ./internal/move/...`

**Verify:**

- `go test ./internal/move/... -v` — all tests pass
- `go test ./internal/move/... -cover` — coverage ≥ 80%

---

### Task 4: Backend IPFS Integration + REST API Endpoints

**Objective:** Implement IPFS icon upload (Pinata + self-hosted option) and create all REST API endpoints for the token creation flow.

**Dependencies:** Task 2, Task 3

**Files:**

- Create: `iota-token-creator-api/internal/ipfs/client.go` (IPFS client interface)
- Create: `iota-token-creator-api/internal/ipfs/pinata.go` (Pinata implementation — Pinata legacy API was deprecated in 2024)
- Create: `iota-token-creator-api/internal/ipfs/selfhosted.go` (self-hosted IPFS node implementation)
- Create: `iota-token-creator-api/internal/ipfs/factory.go` (provider factory based on config)
- Create: `iota-token-creator-api/internal/handler/compile.go` (POST /api/compile)
- Create: `iota-token-creator-api/internal/handler/upload.go` (POST /api/upload-icon)
- Create: `iota-token-creator-api/internal/handler/networks.go` (GET /api/networks)
- Modify: `iota-token-creator-api/internal/server/routes.go` (register new routes)
- Test: `iota-token-creator-api/internal/ipfs/pinata_test.go`
- Test: `iota-token-creator-api/internal/ipfs/selfhosted_test.go`
- Test: `iota-token-creator-api/internal/handler/compile_test.go`
- Test: `iota-token-creator-api/internal/handler/upload_test.go`

**Key Decisions / Notes:**

- IPFS client interface: `Upload(ctx context.Context, file io.Reader, filename string) (cid string, url string, err error)`
- **Pinata** (replaces Pinata which deprecated its legacy upload API in 2024): POST to `https://api.pinata.cloud/pinning/pinFileToIPFS` with `Authorization: Bearer <PINATA_JWT>`. Returns `{IpfsHash, PinSize, Timestamp}`. Free tier: 500 uploads, 1GB storage. Gateway URL: `https://gateway.pinata.cloud/ipfs/<cid>`
- Self-hosted: POST to `<IPFS_API_URL>/api/v0/add`, returns CID, gateway URL is `<IPFS_GATEWAY_URL>/ipfs/<cid>`
- `IPFS_PROVIDER` env var selects provider: `pinata` or `selfhosted`
- **POST /api/compile:** Accepts JSON body `{coinType, name, symbol, decimals, description, iconUrl, supply, maxSupply, network}`, returns `{modules: string[], dependencies: string[], digest: number[]}`
- **POST /api/upload-icon:** Accepts multipart form with `icon` file field (max 1MB, SVG/PNG/JPEG only), returns `{cid, url}`
- **GET /api/networks:** Returns available IOTA networks with RPC URLs
- Rate limiting: 10 requests/minute per IP for compile, 20 for upload. Use chi `realip` middleware to extract actual client IP from `X-Forwarded-For` / `X-Real-IP` headers when behind a proxy (configurable via `TRUSTED_PROXIES` env var). Also rate-limit by wallet address if provided in compile request body
- File validation: max 1MB, content type check, image format validation

**Definition of Done:**

- [ ] POST /api/compile returns valid base64 bytecode for all three coin types
- [ ] POST /api/upload-icon uploads to configured IPFS provider and returns CID + URL
- [ ] GET /api/networks returns network configuration
- [ ] Rate limiting blocks excessive requests
- [ ] Invalid inputs return proper 400 error responses with descriptive messages
- [ ] IPFS provider is configurable via `IPFS_PROVIDER` environment variable
- [ ] Unit tests for all handlers and IPFS clients (with mocked HTTP)
- [ ] All tests pass

**Verify:**

- `go test ./internal/handler/... ./internal/ipfs/... -v` — all tests pass
- `curl -X POST http://localhost:8080/api/compile -H 'Content-Type: application/json' -d '{"coinType":"simple","name":"Test Coin","symbol":"TEST","decimals":6,"network":"testnet"}'` — returns bytecode JSON

---

### Task 5: Frontend Layout, Theme System + Landing Page

**Objective:** Build the responsive layout shell with Material Design 3 theming, dark/light mode, navigation, and a landing page.

**Dependencies:** Task 1

**Files:**

- Modify: `iota-token-creator-web/src/app/layout.tsx` (root layout with providers)
- Modify: `iota-token-creator-web/src/app/page.tsx` (landing page)
- Modify: `iota-token-creator-web/src/app/globals.css` (MD3 design tokens + Tailwind)
- Create: `iota-token-creator-web/src/components/layout/header.tsx`
- Create: `iota-token-creator-web/src/components/layout/footer.tsx`
- Create: `iota-token-creator-web/src/components/layout/mobile-nav.tsx`
- Create: `iota-token-creator-web/src/components/ui/theme-toggle.tsx`
- Create: `iota-token-creator-web/src/components/ui/button.tsx`
- Create: `iota-token-creator-web/src/components/ui/card.tsx`
- Create: `iota-token-creator-web/src/components/landing/hero.tsx`
- Create: `iota-token-creator-web/src/components/landing/features.tsx`
- Create: `iota-token-creator-web/src/components/landing/how-it-works.tsx`
- Create: `iota-token-creator-web/src/app/create/page.tsx` (placeholder)
- Test: `iota-token-creator-web/src/components/layout/__tests__/header.test.tsx`
- Test: `iota-token-creator-web/src/components/ui/__tests__/theme-toggle.test.tsx`

**Key Decisions / Notes:**

- Material Design 3 implemented via Tailwind CSS custom theme: CSS custom properties for MD3 color tokens (`--md-sys-color-primary`, `--md-sys-color-on-primary`, etc.) mapped to Tailwind theme via `tailwind.config.ts`
- Dark mode: `next-themes` provides `useTheme()` hook, Tailwind `dark:` variant for all color utilities
- Responsive breakpoints: mobile-first (`sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`)
- Header: Logo (SVG), navigation links, theme toggle, wallet connect button (placeholder)
- Mobile nav: Hamburger menu with slide-out drawer
- Landing page sections: Hero (headline + CTA), Features (3 coin types), How It Works (3-step process), Footer
- All icons via `react-feather` — rendered as SVG components, colored with Tailwind `className="text-primary"`
- NO PNG/JPG images — all visuals are SVGs or Tailwind-styled components

**Definition of Done:**

- [ ] Layout renders correctly at all breakpoints (320px, 640px, 768px, 1024px, 1280px)
- [ ] Dark/light mode toggle works and persists preference
- [ ] Mobile navigation hamburger menu opens/closes correctly
- [ ] Landing page displays hero, features, and how-it-works sections
- [ ] All Feather icons render as SVGs with Tailwind-controlled colors
- [ ] No PNG/JPG images used — all SVGs
- [ ] Unit tests for Header and ThemeToggle components pass
- [ ] `pnpm build` succeeds without errors

**Verify:**

- `cd iota-token-creator-web && pnpm build` — production build succeeds
- `pnpm test -- --run` — component tests pass

---

### Task 6: Frontend IOTA Wallet Integration

**Objective:** Integrate IOTA dApp Kit for wallet connection, network selection, and wallet state management.

**Dependencies:** Task 5

**Files:**

- Create: `iota-token-creator-web/src/providers/iota-provider.tsx` (IotaClientProvider + WalletProvider + QueryClientProvider)
- Modify: `iota-token-creator-web/src/app/layout.tsx` (wrap with IOTA providers)
- Create: `iota-token-creator-web/src/components/wallet/connect-button.tsx`
- Create: `iota-token-creator-web/src/components/wallet/wallet-info.tsx`
- Create: `iota-token-creator-web/src/components/wallet/network-selector.tsx`
- Create: `iota-token-creator-web/src/hooks/use-wallet-balance.ts`
- Create: `iota-token-creator-web/src/lib/networks.ts` (network config)
- Modify: `iota-token-creator-web/src/components/layout/header.tsx` (add wallet button)
- Test: `iota-token-creator-web/src/components/wallet/__tests__/connect-button.test.tsx`
- Test: `iota-token-creator-web/src/components/wallet/__tests__/network-selector.test.tsx`

**Key Decisions / Notes:**

- Install: `@iota/dapp-kit`, `@iota/iota-sdk`, `@tanstack/react-query`
- Import `@iota/dapp-kit/dist/index.css` for default wallet UI styles
- `createNetworkConfig` with mainnet, testnet, devnet URLs from `getFullnodeUrl()`
- `ConnectButton` wraps dApp Kit's `ConnectModal` with custom MD3 styling
- `NetworkSelector` dropdown allows switching between mainnet/testnet/devnet
- `WalletInfo` shows connected address (truncated) and IOTA balance
- `useWalletBalance` hook uses `useIotaClientQuery('getBalance', ...)` from dApp Kit
- Wallet state is managed by dApp Kit automatically (localStorage persistence)

**Definition of Done:**

- [ ] Wallet connect button visible in header, opens wallet selection modal
- [ ] Can connect to IOTA wallet (testnet) and display address
- [ ] Network selector switches between mainnet/testnet/devnet
- [ ] Connected wallet shows truncated address and IOTA balance
- [ ] Disconnect function works
- [ ] Wallet state persists across page refreshes
- [ ] Unit tests for ConnectButton and NetworkSelector pass
- [ ] IotaClientProvider and WalletProvider wrap root layout; ConnectButton renders without SSR errors (verified by `pnpm build`); useWalletBalance hook returns loading state when no wallet connected (verified by unit test)

**Verify:**

- `cd iota-token-creator-web && pnpm build` — build succeeds with wallet dependencies
- `pnpm test -- --run` — wallet component tests pass

---

### Task 7: Frontend Token Creation Form

**Objective:** Build a multi-step token creation wizard with all three coin types, form validation, icon upload to IPFS, and responsive design.

**Dependencies:** Task 6

**Files:**

- Create: `iota-token-creator-web/src/app/create/page.tsx`
- Create: `iota-token-creator-web/src/components/create/creation-wizard.tsx` (multi-step container)
- Create: `iota-token-creator-web/src/components/create/steps/coin-type-step.tsx`
- Create: `iota-token-creator-web/src/components/create/steps/token-details-step.tsx`
- Create: `iota-token-creator-web/src/components/create/steps/supply-step.tsx`
- Create: `iota-token-creator-web/src/components/create/steps/review-step.tsx`
- Create: `iota-token-creator-web/src/components/create/icon-upload.tsx`
- Create: `iota-token-creator-web/src/components/create/step-indicator.tsx`
- Create: `iota-token-creator-web/src/hooks/use-token-form.ts` (form state management)
- Create: `iota-token-creator-web/src/lib/validation.ts` (form validation rules)
- Create: `iota-token-creator-web/src/lib/api.ts` (backend API client)
- Create: `iota-token-creator-web/src/types/token.ts` (TypeScript types)
- Test: `iota-token-creator-web/src/components/create/__tests__/creation-wizard.test.tsx`
- Test: `iota-token-creator-web/src/lib/__tests__/validation.test.ts`

**Key Decisions / Notes:**

- 4-step wizard: (1) Choose Coin Type → (2) Token Details → (3) Supply Config → (4) Review & Create
- Step 1: Card-based selection for Simple/Managed/Regulated with descriptions of each
- Step 2: Name (required, 3-50 chars), Symbol (required, 2-10 chars uppercase), Decimals (0-18, default 6), Description (optional, max 500 chars), Icon Upload (optional)
- Step 3: Initial Supply (required for Simple/Regulated), Max Supply (optional, CoinManager only), Supply amount validated as positive integer
- Step 4: Review all selections, network badge, estimated gas, "Create Token" button (disabled if wallet not connected)
- Icon upload: Drag & drop or click, preview, uploads to backend `/api/upload-icon`, displays IPFS CID
- Form state managed with React `useReducer` in custom hook
- Validation runs on blur and on step navigation
- All step components use Tailwind responsive classes (mobile-first)

**Definition of Done:**

- [ ] 4-step wizard navigates forward and backward correctly
- [ ] All three coin types selectable with clear descriptions
- [ ] Form validation prevents invalid inputs with clear error messages
- [ ] Icon upload to IPFS works and shows preview + CID
- [ ] Review step accurately displays all entered information
- [ ] Form is fully responsive from 320px to 1280px+
- [ ] "Create Token" button disabled when wallet not connected
- [ ] Supply step shows Max Supply field only when CoinManager coin type is selected; hidden for Simple and Regulated
- [ ] Unit test `supply-step.test.tsx` verifies conditional Max Supply rendering for all three coin types
- [ ] Unit tests for wizard navigation and validation pass

**Verify:**

- `cd iota-token-creator-web && pnpm build` — build succeeds
- `pnpm test -- --run` — form tests pass

---

### Task 8: Frontend Compilation + Publish Flow

**Objective:** Connect the form to the Go backend for compilation, build the publish transaction, handle wallet signing, and display transaction results.

**Dependencies:** Task 4, Task 7

**Files:**

- Create: `iota-token-creator-web/src/hooks/use-publish-token.ts` (compilation + publish logic)
- Create: `iota-token-creator-web/src/components/create/publish-flow.tsx` (progress UI)
- Create: `iota-token-creator-web/src/components/create/transaction-result.tsx` (success/error display)
- Create: `iota-token-creator-web/src/components/create/transaction-progress.tsx` (step-by-step progress indicator)
- Modify: `iota-token-creator-web/src/components/create/steps/review-step.tsx` (wire up publish)
- Modify: `iota-token-creator-web/src/lib/api.ts` (add compile endpoint call)
- Test: `iota-token-creator-web/src/hooks/__tests__/use-publish-token.test.ts`
- Test: `iota-token-creator-web/src/components/create/__tests__/transaction-result.test.tsx`

**Key Decisions / Notes:**

- Publish flow states: `idle` → `compiling` → `signing` → `publishing` → `success` / `error`
- **Compiling:** POST to backend `/api/compile` with token params, receive `{modules, dependencies, digest}`
- **Signing:** Build `Transaction` with `const [upgradeCap] = tx.publish({ modules, dependencies })`, then `tx.transferObjects([upgradeCap], senderAddress)` to handle the UpgradeCap (required — unused UpgradeCap causes on-chain error). Use `useSignAndExecuteTransaction` from dApp Kit. **Verify exact `tx.publish()` API signature** from `@iota/iota-sdk` source before implementation — IOTA may use object-param style `tx.publish({ modules, dependencies })` not positional args
- **Publishing:** Transaction is submitted to the IOTA network via dApp Kit
- **Success:** Display transaction digest, link to IOTA Explorer (`https://explorer.iota.org/txblock/<digest>?network=<network>`), display created objects (TreasuryCap, CoinMetadata, etc.)
- **Error:** Display error message with retry option
- Progress indicator shows current step with spinner/checkmark for each
- Handle gas estimation errors, wallet rejection, network errors

**Definition of Done:**

- [ ] Compilation request to backend succeeds and returns valid bytecode
- [ ] Transaction is built with `tx.publish()` using returned modules and dependencies
- [ ] Wallet signing prompt appears and can be approved/rejected
- [ ] Successful transaction shows digest and explorer link, plus correct created objects per coin type: Simple shows TreasuryCap + CoinMetadata IDs; CoinManager shows CoinManagerTreasuryCap + CoinManagerMetadataCap + CoinManager IDs; Regulated shows TreasuryCap + DenyCap + CoinMetadata + RegulatedCoinMetadata IDs — each with explorer links
- [ ] Error states display clear messages with retry options
- [ ] Progress indicator accurately reflects current step
- [ ] Unit tests for publish hook and result components pass

**Verify:**

- `cd iota-token-creator-web && pnpm build` — build succeeds
- `pnpm test -- --run` — publish flow tests pass

---

### Task 9: OpenTelemetry Instrumentation (Both Codebases)

**Objective:** Add OpenTelemetry tracing, metrics, and logging to both the Go backend and NextJS frontend for error tracking and analytics.

**Dependencies:** Task 4, Task 8

**Files:**

- Create: `iota-token-creator-api/internal/telemetry/telemetry.go` (OTel provider setup)
- Create: `iota-token-creator-api/internal/telemetry/middleware.go` (HTTP tracing middleware)
- Create: `iota-token-creator-api/internal/telemetry/metrics.go` (custom metrics: compile_requests, upload_requests, compile_duration)
- Modify: `iota-token-creator-api/cmd/server/main.go` (initialize OTel on startup, shutdown on exit)
- Modify: `iota-token-creator-api/internal/server/server.go` (add OTel middleware)
- Modify: `iota-token-creator-api/internal/handler/compile.go` (add span attributes for coin type, network)
- Modify: `iota-token-creator-api/internal/handler/upload.go` (add span attributes for file size)
- Modify: `iota-token-creator-api/docker-compose.yml` (add Jaeger/OTEL collector service for local dev)
- Create: `iota-token-creator-web/src/lib/telemetry.ts` (browser OTel setup)
- Create: `iota-token-creator-web/src/instrumentation.ts` (NextJS instrumentation hook)
- Modify: `iota-token-creator-web/next.config.ts` (enable instrumentation)
- Test: `iota-token-creator-api/internal/telemetry/telemetry_test.go`

**Key Decisions / Notes:**

- **Go backend:** Use `go.opentelemetry.io/otel` + `go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp`. OTLP exporter sends to configurable endpoint (env var `OTEL_EXPORTER_OTLP_ENDPOINT`). In dev mode, export to local Jaeger via Docker Compose. In production, export to configured collector.
- **NextJS frontend — CRITICAL: split server/client OTel.** `instrumentation.ts` (server-side) uses `@opentelemetry/sdk-node` (NOT `sdk-trace-web` which requires `window`). Client-side browser tracing isolated to a `'use client'` component using `@opentelemetry/sdk-trace-web` + `@opentelemetry/instrumentation-fetch`, with `typeof window !== 'undefined'` guard. Track: page loads, API call durations (`/api/compile`, `/api/upload-icon`), wallet interactions, transaction outcomes.
- **Custom metrics (Go):** `token_compilations_total` (counter, labels: coin_type, network, status), `compilation_duration_seconds` (histogram), `icon_uploads_total` (counter, labels: status), `active_compilations` (gauge)
- **Custom spans (Go):** compile request → generate_template → iota_cli_build → return_bytecode
- Docker Compose adds Jaeger (all-in-one) on port 16686 for local dev trace viewing
- Configurable via `OTEL_ENABLED` env var (default: true in prod, true in dev)

**Definition of Done:**

- [ ] Go backend produces traces for all API endpoints visible in Jaeger
- [ ] Custom metrics (compilations, uploads, duration) are exported
- [ ] NextJS frontend: `instrumentation.ts` registers TracerProvider with FetchInstrumentation; API calls to `/api/compile` and `/api/upload-icon` produce spans; wallet connection and transaction outcome events recorded as span events with attributes `coin_type`, `network`, `status`
- [ ] Local dev Docker Compose includes Jaeger accessible at `http://localhost:16686`
- [ ] OTel can be disabled via environment variable
- [ ] No performance regression from instrumentation
- [ ] Unit tests for telemetry initialization pass

**Verify:**

- `cd iota-token-creator-api && go test ./internal/telemetry/... -v` — tests pass
- `docker compose up -d && curl http://localhost:16686` — Jaeger UI accessible

---

### Task 10: Backend Testing + IOTA Testnet Docker

**Objective:** Write comprehensive unit and integration tests for the Go backend, including integration tests that use IOTA testnet Docker for real Move compilation.

**Dependencies:** Task 4

**Files:**

- Create: `iota-token-creator-api/internal/handler/health_test.go`
- Create: `iota-token-creator-api/internal/handler/networks_test.go`
- Create: `iota-token-creator-api/internal/middleware/cors_test.go`
- Create: `iota-token-creator-api/internal/middleware/ratelimit_test.go`
- Create: `iota-token-creator-api/internal/config/config_test.go`
- Create: `iota-token-creator-api/internal/move/integration_test.go` (build-tagged integration tests)
- Create: `iota-token-creator-api/testdata/` (test fixtures: sample icon files, expected Move output)
- Modify: `iota-token-creator-api/Makefile` (add `test`, `test-integration`, `test-coverage` targets)
- Modify: `iota-token-creator-api/docker-compose.yml` (add IOTA localnet service for integration tests)

**Key Decisions / Notes:**

- Unit tests: Use Go stdlib `testing` + `httptest` for handler tests. Mock IOTA CLI and IPFS calls.
- Integration tests: Build-tagged with `//go:build integration`. Require IOTA CLI and run against testnet or localnet.
- **IOTA localnet strategy:** Before implementation, verify if `iotaledger/iota-node` Docker image exists on DockerHub/GHCR. If available, use it as a service container. If not, download prebuilt IOTA binary from `github.com/iotaledger/iota/releases` for Linux and run `iota start --force-regenesis --with-faucet`. As a fallback, mock the IOTA CLI binary with a shell script that returns hardcoded valid bytecode for integration tests
- Integration tests compile real Move modules and verify bytecode output. Run as `workflow_dispatch` in CI (not on every push) to avoid being blocked by IOTA infra availability
- Test fixtures include sample icon files (SVG, PNG) and expected Move module output for comparison
- Coverage target: ≥ 80% for unit tests
- Makefile targets:
  - `make test` — unit tests only
  - `make test-integration` — integration tests (requires Docker)
  - `make test-coverage` — unit tests with coverage report

**Definition of Done:**

- [ ] Unit tests exist for all handlers, middleware, config, move generator, move sanitizer, IPFS clients
- [ ] Integration tests compile real Move modules against IOTA localnet Docker
- [ ] `make test` passes with ≥ 80% coverage
- [ ] `make test-integration` passes when Docker is running
- [ ] All edge cases tested: invalid inputs, oversized files, rate limit exceeded, CLI errors
- [ ] Test fixtures are checked into `testdata/`

**Verify:**

- `cd iota-token-creator-api && make test` — all unit tests pass
- `make test-coverage` — shows ≥ 80% coverage

---

### Task 11: Frontend Testing (Vitest Unit + Cypress E2E)

**Objective:** Write comprehensive unit tests with Vitest/RTL and end-to-end tests with Cypress covering responsive design, dark/light mode, and the full token creation flow.

**Dependencies:** Task 8

**Files:**

- Create: `iota-token-creator-web/src/components/landing/__tests__/hero.test.tsx`
- Create: `iota-token-creator-web/src/components/landing/__tests__/features.test.tsx`
- Create: `iota-token-creator-web/src/components/landing/__tests__/how-it-works.test.tsx`
- Create: `iota-token-creator-web/src/components/create/__tests__/coin-type-step.test.tsx`
- Create: `iota-token-creator-web/src/components/create/__tests__/token-details-step.test.tsx`
- Create: `iota-token-creator-web/src/components/create/__tests__/supply-step.test.tsx`
- Create: `iota-token-creator-web/src/components/create/__tests__/review-step.test.tsx`
- Create: `iota-token-creator-web/src/components/create/__tests__/icon-upload.test.tsx`
- Create: `iota-token-creator-web/cypress/e2e/landing.cy.ts`
- Create: `iota-token-creator-web/cypress/e2e/create-token.cy.ts`
- Create: `iota-token-creator-web/cypress/e2e/responsive.cy.ts`
- Create: `iota-token-creator-web/cypress/e2e/dark-mode.cy.ts`
- Create: `iota-token-creator-web/cypress/e2e/wallet.cy.ts`
- Create: `iota-token-creator-web/cypress/support/commands.ts` (custom commands, wallet mocks)
- Create: `iota-token-creator-web/cypress/fixtures/` (mock API responses)

**Key Decisions / Notes:**

- **Vitest unit tests:** Test each component in isolation with RTL. Mock API calls with `msw` (Mock Service Worker). Mock wallet hooks with Jest mocks. Test validation logic, form state transitions, render output.
- **Cypress E2E tests:**
  - `landing.cy.ts`: Verify all landing page sections render, navigation works, CTA links to /create
  - `create-token.cy.ts`: Full token creation flow with mocked backend API. Step navigation, form filling, validation errors, review, mock publish.
  - `responsive.cy.ts`: Test at 5 viewport sizes (320x568 iPhone SE, 375x812 iPhone X, 768x1024 iPad, 1024x768 landscape, 1440x900 desktop). Verify layout, mobile nav, content visibility at each.
  - `dark-mode.cy.ts`: Toggle dark/light mode, verify color changes, persistence.
  - `wallet.cy.ts`: Mock wallet connection, verify UI updates (address display, balance, network).
- Mock IOTA wallet: Inject mock `window.__iota_wallets__` array in `cypress/support/commands.ts` to simulate a connected wallet without a real browser extension. Use `cy.window().then(win => { win.__iota_wallets__ = [...] })` before wallet-dependent tests. Mock backend API responses via `cy.intercept()`
- Mock backend API responses using `cy.intercept()`
- Coverage threshold: ≥ 80% for Vitest unit tests

**Definition of Done:**

- [ ] Vitest unit tests exist for ALL components (landing, create wizard, wallet, UI)
- [ ] Cypress E2E tests cover landing page, full creation flow, responsive design, dark mode
- [ ] Responsive tests verify layout at 5 viewport sizes (320px, 375px, 768px, 1024px, 1440px)
- [ ] Wallet mock enables testing wallet-dependent flows without real wallet
- [ ] `pnpm test -- --run` passes with ≥ 80% coverage
- [ ] `pnpm cypress:run` passes all E2E tests
- [ ] No flaky tests

**Verify:**

- `cd iota-token-creator-web && pnpm test -- --run --coverage` — ≥ 80% coverage
- `pnpm cypress:run` — all E2E tests pass

---

### Task 12: GitHub Actions CI/CD for Both Repos

**Objective:** Set up GitHub Actions workflows for both repos with linting, testing, building, and E2E/integration tests.

**Dependencies:** Task 10, Task 11

**Files:**

- Create: `iota-token-creator-web/.github/workflows/ci.yml` (frontend CI)
- Create: `iota-token-creator-web/.github/workflows/cypress.yml` (Cypress E2E)
- Create: `iota-token-creator-api/.github/workflows/ci.yml` (backend CI)
- Create: `iota-token-creator-api/.github/workflows/integration.yml` (integration tests with IOTA testnet Docker)

**Key Decisions / Notes:**

- **Frontend CI (`ci.yml`):** Triggers on push/PR to main. Steps: checkout → setup Node 20 + pnpm → install → lint → format check → Vitest unit tests with coverage → build → upload coverage artifact
- **Frontend Cypress (`cypress.yml`):** Triggers on push/PR to main. Steps: checkout → setup Node 20 + pnpm → install → build → start server → run Cypress tests → upload screenshots/videos on failure
- **Backend CI (`ci.yml`):** Triggers on push/PR to main. Steps: checkout → setup Go 1.25 → install deps → golangci-lint → go vet → unit tests with coverage → build binary → upload coverage artifact
- **Backend Integration (`integration.yml`):** Triggers on push/PR to main. Steps: checkout → setup Go 1.25 → setup Docker → pull IOTA image → start IOTA localnet → wait for health → run integration tests → cleanup
- IOTA testnet Docker for integration tests: Use `iotaledger/iota-node` Docker image or `iota start --force-regenesis --with-faucet` inside CI
- Cache dependencies: pnpm store for frontend, Go module cache for backend
- Fail CI on: lint errors, test failures, build failures, coverage below 80%
- Configure GitHub Actions secrets: `PINATA_JWT` for IPFS upload tests. If secret not set, skip IPFS integration tests (`if: env.PINATA_JWT != ''`), default to unit tests with mocked IPFS
- **IOTA Explorer URL:** Verify actual URL pattern at `explorer.iota.org` before hardcoding. Store explorer base URL + path template in `src/lib/networks.ts` alongside RPC URLs

**Definition of Done:**

- [ ] Frontend CI runs lint, format, unit tests, build on every push/PR
- [ ] Frontend Cypress runs E2E tests on every push/PR
- [ ] Backend CI runs lint, vet, unit tests, build on every push/PR
- [ ] Backend integration tests run with IOTA testnet Docker in CI
- [ ] All workflows use caching for dependencies
- [ ] CI fails on lint errors, test failures, or coverage < 80%
- [ ] Workflows are triggered on push to main and PRs

**Verify:**

- `yamllint iota-token-creator-web/.github/workflows/*.yml` — all workflow YAML files are syntactically valid
- `yamllint iota-token-creator-api/.github/workflows/*.yml` — all workflow YAML files are syntactically valid
- Grep each workflow for required steps: `lint`, `test`, `build` (frontend CI); `cypress` (Cypress workflow); `golangci-lint`, `test`, `build` (backend CI); `iota` (integration workflow)
- Post-deploy: Push to both repos and verify all 4 GitHub Actions workflows complete with green status

---

## Testing Strategy

- **Unit tests (Vitest/RTL — Frontend):** Test every component, hook, utility function in isolation. Mock external dependencies (API, wallet, IPFS). Target ≥ 80% coverage.
- **Unit tests (Go testing — Backend):** Test every handler, middleware, template generator, sanitizer, IPFS client. Mock CLI and HTTP calls. Target ≥ 80% coverage.
- **Integration tests (Go — Backend):** Test Move compilation against real IOTA localnet Docker. Verify bytecode output is valid. Build-tagged, run separately.
- **E2E tests (Cypress — Frontend):** Test complete user flows (landing → create → form → publish). Test responsive design at 5 viewport sizes. Test dark/light mode. Mock backend API and wallet.
- **Manual verification:** After implementation, run both servers locally with Docker Compose and manually test the full token creation flow on IOTA testnet.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| IOTA CLI `--dump-bytecode-as-base64` output format changes | Low | High | Pin IOTA CLI version in Docker; parse output defensively with fallback error messages |
| Move source injection via user inputs | Medium | Critical | Strict input sanitizer: module names only allow `[a-z_]`, symbols only `[A-Z0-9_]`, descriptions escape all special chars; unit test with injection payloads |
| IOTA CLI compilation is slow (downloads git deps) | Medium | Medium | Pre-cache Move framework dependencies in Docker image during build; use `--skip-fetch-latest-git-deps` flag |
| Pinata API downtime | Low | Medium | Self-hosted IPFS fallback option; configurable provider; health check before upload |
| IOTA dApp Kit breaking changes | Low | Medium | Pin `@iota/dapp-kit` and `@iota/iota-sdk` to exact versions (no ranges) in package.json. Cypress E2E `wallet.cy.ts` detects regressions on every CI run. Isolate all dApp Kit imports behind `src/lib/wallet-adapter.ts` so breaking API changes require updating only one file |
| Go 1.25 not yet released | Medium | Low | Pin go.mod to `go 1.25` and Dockerfile to `golang:1.25-alpine`. If 1.25 is unavailable at implementation time, use highest stable release (e.g., 1.24), create a GitHub issue to track upgrade, and update go.mod + Dockerfile + CI workflow atomically when 1.25 releases |
| Docker-in-Docker complexity in CI | Medium | Medium | Use service containers in GitHub Actions for IOTA localnet instead of Docker-in-Docker |

## Open Questions

- What is the user's GitHub username for creating the private repos? (Will be determined during implementation)
- Exact IOTA CLI version to pin in Docker (will use latest stable testnet release)
- Production deployment target (Vercel for frontend, Cloud Run/Fly.io for backend) — deferred, out of scope for this plan

### Deferred Ideas

- Token management dashboard (mint, burn, update metadata)
- Token listing / gallery of created tokens
- Multi-language support (i18n)
- Analytics dashboard with OpenTelemetry data visualization
- Batch token creation
- Token migration tool (Simple → CoinManager)
