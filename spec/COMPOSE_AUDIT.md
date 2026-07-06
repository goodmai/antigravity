# Compose Audit — Daskibo Greenfield / Lit

Date: 2026-05-22

## Scope

Reviewed:

- `smartcontracts/docker-compose.yml`
- `smartcontracts/docker-compose.lit.yml`
- `smartcontracts/greenfield-local/docker-compose.yml`
- `smartcontracts/greenfield-local/Dockerfile`
- `smartcontracts/greenfield-local/entrypoint.sh`
- `smartcontracts/greenfield-local/bootstrap_gvg.go`
- `smartcontracts/greenfield-testnet/docker-compose.yml`
- `COMPOSE.md`
- `smartcontracts/README.md`
- `TESTING.md`
- `uc.md`
- `logs/*.log`

Compose syntax validation passed for:

```bash
docker compose -f smartcontracts/docker-compose.yml --profile e2e-full config --quiet
docker compose -f smartcontracts/docker-compose.lit.yml config --quiet
```

## Current Compose Structure

### `smartcontracts/docker-compose.yml`

This is now a unified profile-based orchestration file, not only the old Flow A mock stack.

Profiles:

- `local-mock`
- `local`
- `testnet`
- `mainnet`
- `test-local`
- `test-devnet`
- `local-real-chipotle`
- `e2e-full`

Important services:

- `frontend`: nginx static site on host port `8085`.
- `mock-sp`: in-memory Greenfield SP emulator on host port `9000`.
- `chipotle-mock`: Node Chipotle mock on host port `8000`.
- `greenfield-local`: real local Greenfield chain/SP, with GVG bootstrap health sentinel.
- `testnet-writer`: Greenfield testnet Lit writer.
- `mainnet-writer`: Greenfield mainnet writer.
- `test-local-runner`: runs local Greenfield docker test.
- `test-devnet-runner`: runs live/testnet Greenfield test.
- `chipotle-anvil`, `chipotle-dstack-sim`, `chipotle-deployer`, `chipotle-bootstrap`, `chipotle-real`, `chipotle-jaeger`: local real-Chipotle/TEE-emulation stack.
- `anvil`, `deploy`, `e2e`: user-contract E2E stack.

### `smartcontracts/docker-compose.lit.yml`

This is the same-network Lit NFT gating E2E stack.

It starts:

- Chipotle contract chain on `chipotle-anvil`
- dstack simulator
- Chipotle deploy/bootstrap/real API
- Jaeger
- local Greenfield chain/SP
- Foundry deploy for NFT and marketplace contracts
- `e2e-lit` runner

The runner uses:

- `GF_CHAIN_ID=9000`
- `GF_RPC=http://greenfield-local:26750`
- `GF_SP=http://greenfield-local:9033`
- local test private key/address

This is the cleanest Compose file for the current UC-04/UC-05 paid NFT gating E2E.

### `smartcontracts/greenfield-local/docker-compose.yml`

This is a standalone local Greenfield private-chain file.

Current behavior:

- Builds from `greenfield-local/Dockerfile`.
- Uses no persistent chain volume.
- Exposes `26750`, `9033`, `1317`.
- Healthcheck waits for `/tmp/gvg_bootstrapped`, not only RPC readiness.

### `smartcontracts/greenfield-testnet/docker-compose.yml`

This remains the standalone public testnet + Chipotle mock writer stack.

It is separate from the unified profile stack and should not be combined with other Compose files.

## UC Mapping

Relevant use cases from `uc.md`:

- UC-01: public unencrypted Greenfield page and object save path.
- UC-02: author publishes encrypted course; manifest contains Lit/sidecars.
- UC-03: author has free access to own content.
- UC-04: buyer purchases time-limited access; soulbound `AccessPass` minted.
- UC-05: buyer decrypts via Lit/Chipotle ACC check.
- UC-09: abuse paths must fail.
- UC-10: same client/orchestrator should work over mock, real-private, and testnet flows.

Current Compose coverage:

- UC-01 / UC-10 mock: `local-mock` profile or old standalone Flow A behavior.
- UC-02 / UC-05 testnet DRM: `greenfield-testnet/docker-compose.yml` and `testnet` profile.
- UC-04 / UC-05 same-network paid NFT E2E: `docker-compose.lit.yml`.
- UC-10 local private chain: `greenfield-local/docker-compose.yml`, `local`, `test-local`, and `e2e-full`.

## Log Findings

Latest meaningful failure:

```text
E2E-LIT-NFT FAILED: Error: Query failed with (6): global virtual group family statistics not exist.: unknown request
```

Observed in:

- `logs/e2e-lit-run.log`
- `logs/e2e-lit-lit.log`

The run reached:

1. Chipotle connection.
2. PKP creation.
3. Course registration on marketplace.
4. ACC setup.
5. Master-key encryption.
6. Greenfield SDK upload start.

It failed during Greenfield bucket/object upload.

`logs/greenfield-local-lit.log` shows:

- local Greenfield genesis starts
- `SPS=7`
- block height reaches at least 12
- `bootstrap_gvg` broadcasts `MsgCreateGlobalVirtualGroup`
- log prints `TX SUCCEEDED`
- block height advances
- `/tmp/gvg_bootstrapped` is created

However, the SDK still later reports missing global virtual group family statistics.

## Findings

### 1. Documentation drift

`COMPOSE.md` describes `smartcontracts/docker-compose.yml` as the old Flow A mock stack. The actual file is now a unified multi-profile stack.

Specific drift:

- Docs say frontend uses `8080`; current unified stack uses `8085`.
- Docs say `smartcontracts/docker-compose.yml up -d`; current file usually needs `--profile local-mock`, `--profile local`, etc.
- Docs say local Greenfield `SPS` default is `1`; unified and Lit stacks use `SPS=7`.
- Docs describe healthcheck as RPC/network readiness; current healthcheck is `/tmp/gvg_bootstrapped`.

### 2. Greenfield local health is probably too optimistic

`entrypoint.sh` creates `/tmp/gvg_bootstrapped` after:

- `bootstrap_gvg` returns success
- block height advances once

That does not prove the virtual group family statistics query is populated and readable by the Greenfield JS SDK.

The E2E failure strongly suggests a race or incomplete bootstrap condition.

Recommended fix:

- After broadcasting GVG, poll the exact query path or SDK-equivalent state needed by upload.
- Create `/tmp/gvg_bootstrapped` only when the family statistics query is available.
- If no CLI query is easy, add a small Node/Go readiness probe that performs the same query the SDK needs.

### 3. `bootstrap_gvg.go` treats broadcast acceptance as readiness

`BroadcastTx` success plus a block-height advance is not enough evidence that the GVG family statistics are available.

Recommended fix:

- Capture and query the resulting GVG/family state.
- Fail loudly if the query does not become available within a timeout.

### 4. Unified `e2e` env has local/testnet conflict

In `smartcontracts/docker-compose.yml`, the `e2e` service sets local Greenfield variables:

```text
RUN_GREENFIELD_LOCAL=1
GREENFIELD_LOCAL_RPC=http://greenfield-local:26750
GREENFIELD_LOCAL_SP=http://greenfield-local:9033
```

But it also sets testnet values:

```text
GF_CHAIN_ID=5600
GF_RPC=https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org
GF_SP=https://gnfd-testnet-sp1.bnbchain.org
```

Recommended fix:

- Split local and testnet E2E runner services, or
- make `GF_CHAIN_ID/GF_RPC/GF_SP` consistently local for `e2e-full`.

### 5. `docker-compose.lit.yml` is clearer than unified `e2e-full`

For same-network paid Lit NFT gating, `docker-compose.lit.yml` is more coherent:

- Chipotle API and contracts use `chipotle-anvil`.
- Greenfield is local and uses `GF_CHAIN_ID=9000`.
- The runner dynamically resolves deployed contracts from Foundry broadcast output.

This file should be documented as the canonical UC-04/UC-05 same-network paid gating E2E.

## Recommended Fix Order

1. Harden Greenfield GVG readiness before marking `greenfield-local` healthy.
2. Fix `smartcontracts/docker-compose.yml` `e2e` local/testnet env conflict.
3. Update `COMPOSE.md` to describe the current profile-based structure.
4. Update `README.md` quick starts:
   - Flow A should use `--profile local-mock` and port `8085`.
   - Flow B should mention GVG bootstrap and `SPS=7` where relevant.
   - Add `docker-compose.lit.yml` as canonical same-network paid NFT gating E2E.
5. Add a troubleshooting section for:
   - `global virtual group family statistics not exist`
   - port conflicts on `8000`, `8545`, `9033`, `26750`
   - missing external `CHIPOTLE_DIR` or `SIMULATOR_DIR`

## Useful Commands

List profiles:

```bash
docker compose -f smartcontracts/docker-compose.yml config --profiles
```

Validate unified stack:

```bash
docker compose -f smartcontracts/docker-compose.yml --profile e2e-full config --quiet
```

Validate Lit E2E stack:

```bash
docker compose -f smartcontracts/docker-compose.lit.yml config --quiet
```

Run Lit NFT gating E2E:

```bash
docker compose -f smartcontracts/docker-compose.lit.yml up --build --abort-on-container-exit --exit-code-from e2e-lit
```

Tail local Greenfield logs:

```bash
docker compose -f smartcontracts/docker-compose.lit.yml logs -f greenfield-local
```

Check failed runner logs:

```bash
docker compose -f smartcontracts/docker-compose.lit.yml logs e2e-lit
```
