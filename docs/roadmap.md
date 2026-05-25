# Antigravity Protocol — Roadmap

From devnet to a DAO‑owned public good. Each **growth point** below is phrased as a task and
mirrored 1:1 in [EPIC‑01](./epics/EPIC-01-devnet-testnet-deployment.md).

> Companion docs: [Whitepaper](./whitepaper.md) · [Yellowpaper](./yellowpaper.md) ·
> [Grants](./grants.md)

---

## Phase flow

```mermaid
flowchart LR
    P0["Phase 0<br/>Foundations"] --> P1["Phase 1<br/>Devnet"]
    P1 --> P2["Phase 2<br/>Public testnet<br/>(multi-chain)"]
    P2 --> P3["Phase 3<br/>Audit & hardening"]
    P3 --> P4["Phase 4<br/>Mainnet / Superchain"]
    P4 --> P5["Phase 5<br/>DAO handoff"]
```

## Timeline (indicative)

```mermaid
gantt
    title Antigravity Protocol delivery (indicative, ~2 weeks/unit)
    dateFormat  YYYY-MM-DD
    axisFormat  %m-%y
    section Foundations
    Spec freeze + threat model      :p0a, 2026-06-01, 14d
    contracts/ scaffold (Hardhat+Foundry) :p0b, after p0a, 14d
    section Devnet
    Implement 5 contracts           :p1a, after p0b, 28d
    Sandbox parity + Foundry tests  :p1b, after p1a, 14d
    Local Anvil deploy + scripts    :p1c, after p1b, 7d
    section Testnet
    Sepolia deploy + verify         :p2a, after p1c, 7d
    Arbitrum/OP/Base/BNB testnets   :p2b, after p2a, 14d
    Testnet dApp + faucet onboarding:p2c, after p2b, 21d
    section Hardening
    Internal audit + fuzzing        :p3a, after p2c, 21d
    External audit + fixes          :p3b, after p3a, 28d
    section Mainnet
    Mainnet/Superchain deploy       :p4a, after p3b, 14d
    section Governance
    AGT governance + DAO handoff    :p5a, after p4a, 28d
```

## Phase detail

### Phase 0 — Foundations
- Freeze the [Yellowpaper](./yellowpaper.md) spec; write the threat model.
- Scaffold `contracts/` (Hardhat **and** Foundry) alongside the existing JS tooling.
- **Exit:** spec signed off, empty project compiles in CI.

### Phase 1 — Devnet
- Implement `AGT`, `SkillCredential`, `SkillRegistry`, `RewardDistributor`, `Attestor`.
- Achieve **sandbox parity** with `academy/courses/web3-genesis/assets/sandbox.js`.
- Deploy to local Anvil/Hardhat node with seed/fixture scripts.
- **Exit:** full Foundry suite green; local end‑to‑end mint + claim works.

### Phase 2 — Public testnet (multi‑chain)
- Deploy to **Sepolia**, **Arbitrum Sepolia**, **Optimism Sepolia**, **Base Sepolia**, **BNB
  testnet**; verify contracts on each explorer.
- Wire the testnet dApp (read registry, mint credential, claim AGT) via `viem`.
- Faucet + onboarding flow for testers.
- **Exit:** a public tester can earn an SBT and claim testnet AGT on ≥2 chains.

### Phase 3 — Audit & hardening
- Internal review + fuzz/invariant runs; then an external audit; fix and re‑test.
- **Exit:** audit report published, criticals resolved.

### Phase 4 — Mainnet / Superchain
- Mainnet deploy; prioritize an L2 / Superchain target chosen with the [Grants](./grants.md)
  matrix.
- **Exit:** verified mainnet contracts + monitoring/alerting live.

### Phase 5 — DAO handoff
- Move curriculum weights, emission `d`, and the attestor set under AGT governance; transfer
  treasury to the DAO.
- **Exit:** core multisig powers retired/timelocked; protocol is community‑owned.

## Growth points (tasks → EPIC‑01)

| # | Growth point | Why it matters |
| --- | --- | --- |
| G1 | **EAS attestations** | Trust‑minimize completion proofs; third‑party verifiable. |
| G2 | **Account abstraction onboarding** | New learners get a smart wallet without seed‑phrase friction. |
| G3 | **Gasless mint + claim (paymaster)** | Remove the "fund your wallet first" barrier on testnet/mainnet. |
| G4 | **zk proof of completion** | Eliminate the trusted Attestor; prove assessment passage in zero knowledge. |
| G5 | **Subgraph indexing** | Fast registry/profile queries for the dApp and integrators. |
| G6 | **Multi‑chain SBT sync** | Read credentials cross‑chain (Superchain interop / messaging). |
| G7 | **Mobile wallet flow** | Mirror the academy's mobile reach; in‑app credential wallet. |
| G8 | **DAO treasury & skill bounties** | Sponsors escrow AGT for targeted skill tracks. |

---

*Next:* [EPIC‑01 — Devnet/Testnet deployment](./epics/EPIC-01-devnet-testnet-deployment.md)
