# Lab 25 — Akash deploy + артефакты в IPFS

> Модуль 9 · 3 ч · Sandbox: Akash testnet · DSOMM: *Operations — Decentralized resilience*

## Задача

Опубликовать ваше распиленное приложение в Akash (testnet), артефакт сборки
+ SBOM положить в IPFS через web3.storage. Проверить целостность по CID.

## Шаги

1. `akash` CLI + создать кошелёк, получить testnet-токены (faucet).
2. Подготовить SDL-манифест (lesson 9.2). Образ — multi-arch, запинен по digest.
3. `akash tx deployment create` → bids → `lease create` → `provider send-manifest`.
4. Проверить доступность endpoint'а.
5. Опубликовать SBOM в IPFS:
   ```bash
   w3 login you@example.com
   w3 up sbom.cdx.json   # → CID
   ```
6. В `release notes` GH-Release добавить ipfs:// и https://w3s.link/ipfs/...
7. Проверить целостность скачиванием.

## Acceptance

- [ ] Akash-deployment живой, отвечает.
- [ ] SBOM в IPFS, CID соответствует local hash.
- [ ] CI прикладывает CID к release-notes.

## Rubric: 1 — deploy в Akash; 2 — артефакт в IPFS; 3 — verify integrity; 4 — fallback на AWS при недоступности Akash; 5 — multi-provider Akash + Filecoin storage proof of long-term persistence.
