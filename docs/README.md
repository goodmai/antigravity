# Antigravity Protocol — Documentation

Founding documents for evolving the Antigravity Laboratory into the **Proof‑of‑Skill
Protocol**: verifiable, on‑chain credentials and a learn‑to‑earn token (AGT) for the
agentic‑coding era.

## Map

```mermaid
flowchart TD
    WP["whitepaper.md<br/>vision + token utility"] --> YP["yellowpaper.md<br/>contracts + formulas + security"]
    YP --> E1["epics/EPIC-01<br/>devnet → testnet deploy"]
    WP --> RM["roadmap.md<br/>phases + growth points"]
    E1 --> RM
    RM --> GR["grants.md<br/>multi-chain grant matrix"]
    WP --> E2["epics/EPIC-02<br/>pitch deck"]
    WP --> E3["epics/EPIC-03<br/>marketing"]
    GR --> E2
```

## Contents

| Doc | What it is |
| --- | --- |
| [whitepaper.md](./whitepaper.md) | Vision, problem, Proof‑of‑Skill solution, AGT token, governance |
| [yellowpaper.md](./yellowpaper.md) | Contracts, data structures, reward formula, security model |
| [roadmap.md](./roadmap.md) | Phased delivery (devnet→DAO) + growth points, with Gantt |
| [grants.md](./grants.md) | Grant programs across Arbitrum, Optimism, Base, BNB, Polygon, Scroll, zkSync, Linea, Celo, Avalanche, Gitcoin/Octant |
| [epics/EPIC-01-devnet-testnet-deployment.md](./epics/EPIC-01-devnet-testnet-deployment.md) | Deployment tasks + growth‑point tasks + impl notes |
| [epics/EPIC-02-pitch-deck.md](./epics/EPIC-02-pitch-deck.md) | Pitch deck & data‑room epic |
| [epics/EPIC-03-marketing.md](./epics/EPIC-03-marketing.md) | Go‑to‑market & community epic |

## Status

Draft / pre‑testnet. Token mechanics and timelines are illustrative and subject to legal +
governance review (see the whitepaper disclaimer). These are planning documents; the
**protocol** contracts (`AGT`, `SkillCredential`, `SkillRegistry`, `RewardDistributor`,
`Attestor`) are not built yet — EPIC‑01 specifies that work.

> **Repo reality (actualized).** The repository is **not** greenfield‑Solidity. A related,
> working Solidity codebase already ships under `smartcontracts/contracts/` — the DRM course
> platform (`AccessPass`, `CourseMarketplace`, `Treasury`, and the soulbound role NFTs
> `SoulboundAccessNft`/`AuthorNft`/`ClientNft`), documented in [`../sc.md`](../sc.md). It uses
> Foundry + OpenZeppelin v5.6.1, has a contracts CI gate (`.github/workflows/test.yml`), 86
> forge tests at 100% coverage, and a Lit + BNB Greenfield e2e. EPIC‑01 should **reuse** these
> building blocks — especially the in‑repo soulbound ERC‑721 pattern and the Foundry/CI
> harness — rather than scaffold from scratch. Testing strategy: [`../workflow_cicd.md`](../workflow_cicd.md);
> testnet funding: [`../uc.md`](../uc.md) (Funding Matrix).
