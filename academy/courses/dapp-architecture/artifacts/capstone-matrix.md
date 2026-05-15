# Capstone — матрица выбора 9×3 + threat-model

> Финальный артефакт (урок 3.13). Заполнить **рекомендацию** по каждому
> кирпичу и обосновать через trade-off, а не по моде. Гибрид — норма.

## Матрица 9×3

Шкала trade-off для каждой ячейки: **стоимость · латентность · доверие ·
суверенитет данных · операционная сложность · vendor lock-in**.

| Кирпич | Классика (М1) | Google (М2) | Децентрализация (М3) | **Рекомендация + почему** |
|---|---|---|---|---|
| Compute | контейнеры | Cloud Run / GKE | Akash / Fluence | |
| State / Data | PostgreSQL | Spanner / Firestore | on-chain + The Graph | |
| Storage / Media | S3 + CDN | GCS / Cloud CDN | IPFS / Arweave | |
| Messaging | Kafka | Pub/Sub | libp2p / Ceramic | |
| Identity / Auth | OIDC | Cloud IAM / Firebase | кошелёк / SIWE / DID | |
| Networking | LB / API GW | VPC / Armor / Apigee | p2p / RPC / шлюзы | |
| Secrets / Keys | Vault-класс | Secret Mgr / KMS | MPC / ERC-4337 / ZK | |
| Observability | метрики/логи/трейсы | Cloud Monitoring | The Graph / Dune | |
| Delivery / Govern. | CI/CD / IaC | Cloud Build / Deploy | DAO / аудит | |

## Обоснование (на каждую рекомендацию)

Для строки матрицы — 2–4 предложения с **цифрами**: ориентир стоимости,
ожидаемая латентность, граница доверия, кто владеет риском.

## Threat-model гибрида (STRIDE)

| Угроза | Поверхность в гибриде | Контрмера |
|---|---|---|
| Spoofing | подделка автора / sybil | подпись кошельком, репутация |
| Tampering | подмена цены / медиа | серверная цена, CID-иммутабельность |
| Repudiation | «я не покупал» | on-chain событие + аудит |
| Info disclosure | данные на недоверенной ноде | шифрование в покое, no-secrets |
| DoS | RPC-лимиты, шлюз IPFS | мульти-провайдер, кэш |
| Elevation | proxy-admin контракта | timelock + multisig |

## Защита capstone — чек-лист

- [ ] Матрица 9×3 заполнена с обоснованием trade-off.
- [ ] C4 Context + Container гибрида (`c4/container-hybrid.puml`).
- [ ] ≥5 ADR (0001–0005) переведены из `proposed` в `accepted`.
- [ ] Threat-model гибрида с контрмерами.
- [ ] Решение «централизовать / Google / децентрализовать» защищено
      цифрами по стоимости, латентности и суверенитету данных.
