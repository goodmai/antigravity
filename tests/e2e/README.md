# e2e/

Script-уровень E2E. Гринфилд + Lit Protocol + Chipotle DRM, без браузера.

Тесты живут в `smartcontracts/e2e/` (run-e2e.mjs, run-e2e-lit-nft.mjs).

```sh
# Запуск (требует GREENFIELD_TESTNET_PRIVATE_KEY)
node smartcontracts/e2e/run-e2e.mjs
./run_e2e_lit.sh
# CI джобы: "E2E Lit Protocol Gating Integration", "Devnet E2E"
```

⚠️ Зависит от Greenfield testnet SP sealing — нестабилен (~280с таймаут).
