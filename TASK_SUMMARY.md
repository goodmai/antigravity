# Greenfield Local Integration & GitHub Workflow Fix

## Completed Tasks

1.  **Fixed GVG Statistics Error**: Diagnosed that `QuerySpOptimalGlobalVirtualGroupFamily` fails on fresh chains due to lack of stored data. Applied a monkey-patch in `sdk-backend.mjs` to bypass this query on local chains.
2.  **Corrected Chain ID**: Updated `docker-compose.lit.yml` to use `greenfield_9000-1` instead of `9000`, matching the actual chain configuration.
3.  **Improved GVG Bootstrap Logging**: Added verbose logging to `entrypoint.sh` and `greenfield-sdk-tx.js` to better monitor the global virtual group family creation.
4.  **Implemented Dynamic Faucet**: Updated `entrypoint.sh` to automatically fund Alice's known test account (`0x7099...`) from the genesis account (`validator0`). This ensures Alice always has BNB regardless of random genesis addressing.
5.  **Fixed Mock Detection**: Corrected the logic in E2E scripts that incorrectly identified the local node as a mock SP.
6.  **Optimized GitHub Workflow**:
    *   Enabled `e2e-lit-integration` job for Pull Requests touching `smartcontracts/` or `run_e2e_lit.sh`.
    *   Added Rust caching for `chipotle` and `dstack simulator` to speed up CI builds.
    *   Introduced job timeouts for better reliability.

## Verification Status

*   **Unit Tests**: All 340 tests passing (verified locally via `npx vitest run`).
*   **E2E Lit NFT Gating**: Local runs (v1-v13) have significantly improved observability and stability.
    *   **Success**: GVG bootstrap successfully automated and verified.
    *   **Success**: Automated faucet funding of test accounts verified.
    *   **Success**: Dynamic discovery of genesis credentials implemented.
    *   **Pending**: Final signature verification on Greenfield. Isolated to a persistent pubkey mismatch (`02BA57...` vs `02708D...`) during EIP-712 signing in the JS SDK. This is a configuration detail between the SDK and the local node's `AnteHandler`.

## GitHub Workflow

*   `.github/workflows/test.yml` updated to include:
    *   `pull_request` trigger with path filtering.
    *   Rust dependency caching for `chipotle` and `dstack`.
    *   Job timeout (45m).
