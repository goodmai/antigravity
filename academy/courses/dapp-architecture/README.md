# △ Архитектура децентрализованного приложения

> Символ курса — **масонский циркуль △**: один домен мы трижды «обводим
> вокруг центра» — классикой, облаком Google и децентрализацией.
>
> 3 модуля · 35 уроков · сквозной проект · capstone-матрица выбора.

Курс учит **проектировать**, а не зубрить стек. Один и тот же продукт
строится тремя способами по неизменной сетке из 9 «кирпичей», чтобы
архитектурные решения принимались сравнением trade-off, а не по моде.

- 📋 **План и хребет:** [`plan.md`](./plan.md)
- 📚 **Уроки:** [`lessons/`](./lessons/) *(35 уроков · 3 модуля)* — старт: [урок 1.1](./lessons/1-1/index.html)
- 🧱 **Sandboxes:** [`sandboxes/`](./sandboxes/) *(classic · gcp-lite · chain · depin)*
- 📐 **Артефакты:** [`artifacts/`](./artifacts/) *(ADR · C4 · capstone-матрица)*

## Три проекции одного домена

| Кирпич | Модуль 1 · Классика | Модуль 2 · Google | Модуль 3 · Децентрализация |
|---|---|---|---|
| Compute | сервер/контейнеры | Cloud Run / GKE | Akash / Fluence / Golem |
| State / Data | PostgreSQL | Spanner / Cloud SQL / Firestore | on-chain + The Graph |
| Storage / Media | объектное + CDN | Cloud Storage / Cloud CDN | IPFS / Filecoin / Arweave |
| Messaging | Kafka / RabbitMQ | Pub/Sub / Eventarc | libp2p / Ceramic / OrbitDB |
| Identity / Auth | OAuth 2.1 / OIDC | Cloud IAM / Firebase Auth | кошелёк / SIWE / DID |
| Networking | LB / API GW | VPC / Cloud Armor / Apigee | p2p / RPC / шлюзы |
| Secrets / Keys | Vault-класс | Secret Manager / Cloud KMS | MPC / ERC-4337 / ZK |
| Observability | логи/метрики/трейсы | Cloud Monitoring / SLO | The Graph / Dune / ноды |
| Delivery / Govern. | CI/CD / IaC | Cloud Build / Deploy | DAO / аудит / governance |

## Структура курса

- **Модуль 1 — Современный классический подход** (11 уроков): mainstream
  централизованная архитектура: DDD, слои, монолит↔микросервисы, API,
  данные, событийность, auth, наблюдаемость, масштаб, безопасность.
- **Модуль 2 — Облачный Google подход** (11 уроков): та же сетка кирпичей
  managed-first на Google Cloud — Cloud Run/GKE, Spanner/Firestore,
  Pub/Sub/BigQuery, IAM, SRE/SLO, Cloud Build.
- **Модуль 3 — Децентрализованные аналоги и альтернативы** (13 уроков):
  для каждого кирпича — децентрализованный аналог, его цена, доверие и
  граница применимости; финал — эталонный гибрид и матрица выбора.

## Кому подходит

- **Архитектор / Tech Lead**, кому нужно осознанно выбирать между
  централизацией, облаком и Web3 — с цифрами, а не по хайпу.
- **Backend/Full-stack Senior**, выходящий на архитектурные решения.
- **Web3-инженер**, которому нужна полная картина приложения, а не только
  смарт-контракт.

## Что вы получите

C4-диаграммы (Context + Container) для всех трёх проекций, набор ADR по
спорным решениям и **capstone-матрицу выбора 9×3** с обоснованной
гибридной архитектурой и threat-model.

Канон-источники и пререквизиты — внутри уроков и в [`plan.md`](./plan.md).
