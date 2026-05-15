# Архитектура децентрализованного приложения — План и хребет курса

> **Символ курса:** масонский циркуль △ — *измерить, разметить, удержать границы*.
> Циркуль чертит окружность вокруг центра: один и тот же домен мы трижды
> «обводим» — классикой, облаком Google и децентрализованными аналогами.
>
> **Версия:** 1.0 · **Длительность:** 3 модуля · 35 уроков · capstone
> **Уровень:** Middle → Senior / Architect · **Язык:** RU (с EN-терминологией)
> **Подход:** один и тот же продукт проектируется тремя способами, по одной и
> той же сетке «кирпичей», чтобы решения сравнивались, а не заучивались.

---

## 0. Философия курса

1. **Один домен — три проекции.** Сквозной продукт (условный «маркетплейс
   цифровых работ + лента + платежи») проектируется в каждом из трёх
   модулей. Меняется не задача, а архитектурная парадигма.
2. **Сетка кирпичей неизменна.** Compute · State/Data · Storage/Media ·
   Messaging/Events · Identity/Auth · Networking · Secrets/Keys ·
   Observability · Delivery/Governance. Каждый модуль закрывает все девять
   позиций — это и есть «циркуль», обводящий один центр.
3. **Сравнение, а не вера.** Для каждого кирпича — таблица trade-off:
   стоимость, латентность, доверие, суверенитет данных, операционная
   сложность, vendor lock-in.
4. **Гибрид — это нормально.** Финал курса — не «всё на блокчейне», а
   осознанный гибрид: что оставить классикой, что отдать Google, что
   децентрализовать.
5. **Доказательство в репозитории.** Каждый модуль завершается C4-диаграммой
   и ADR (Architecture Decision Record) в личном форке; capstone сводит три
   проекции в одну матрицу выбора.

---

## 1. Источники (канон, по которому выстроен курс)

| Категория | Что используем |
|---|---|
| **Архитектурные основы** | C4 model, DDD (Evans/Vernon), 12-Factor App, *Fundamentals of Software Architecture* (Richards/Ford), *DDIA* (Kleppmann) |
| **Классика / распределённые системы** | REST (Fielding), GraphQL/gRPC specs, OAuth 2.1 + OIDC Core, CAP/PACELC, SQL:2016, OWASP ASVS/Top 10 |
| **Google Cloud** | Google Cloud Architecture Framework, SRE Book / SRE Workbook, Cloud Run / GKE Autopilot / Spanner / BigQuery / Firestore / Pub/Sub docs, Firebase docs |
| **Децентрализация** | Ethereum Yellow/Beige paper, EIP-1559, ERC-20/721/1155/4337, IPFS/Filecoin spec, Arweave yellow-paper, libp2p, The Graph, Chainlink, W3C DID/VC, SIWE (EIP-4361) |
| **DePIN compute/storage** | Akash SDL, Fluence, Golem, Flux, Storj, Ceramic, OrbitDB |
| **Принятие решений** | ADR (Nygard), Wardley Maps, Well-Architected trade-off analysis |

Точные ссылки на конкретные документы — внутри уроков, в блоке **«Канон»**.

---

## 2. Архитектура курса

```
                              ┌───────────┐
                              │   ДОМЕН    │  ← один сквозной продукт
                              └─────┬─────┘
              циркуль △ обводит центр трижды:
   ┌──────────────────┬──────────────────┬──────────────────┐
   │  Модуль 1         │  Модуль 2         │  Модуль 3         │
   │  Классика         │  Облако Google    │  Децентрализация  │
   │  (11 уроков)      │  (11 уроков)      │  (13 уроков)      │
   ├──────────────────┼──────────────────┼──────────────────┤
   │ Compute           │ Cloud Run / GKE   │ Akash / Fluence   │
   │ State / Data      │ Spanner / Cloud SQL│ on-chain + Graph │
   │ Storage / Media   │ Cloud Storage/CDN │ IPFS / Arweave    │
   │ Messaging         │ Pub/Sub / Eventarc│ libp2p / Ceramic  │
   │ Identity / Auth   │ Cloud IAM / Firebase│ Кошелёк / DID    │
   │ Networking        │ VPC / Cloud Armor │ p2p / RPC / шлюзы │
   │ Secrets / Keys    │ Secret Mgr / KMS  │ MPC / AA / ZK     │
   │ Observability     │ Cloud Monitoring  │ The Graph / Dune  │
   │ Delivery/Govern.  │ Cloud Build/Deploy│ DAO / аудит       │
   └──────────────────┴──────────────────┴──────────────────┘
                              ▼
                   Capstone: матрица выбора +
                   эталонная гибридная архитектура
```

---

## 3. Детальная программа

### Модуль 1 · Современный классический подход (11 уроков)

> Mainstream-архитектура: централизованная, проверенная, индустриальная.

| # | Урок | Что внутри | Артефакт |
|---|------|-----------|----------|
| 1.1 | Приложение как система | домен, границы контекстов (DDD), контракты, C4-уровни | C4 Context-диаграмма продукта |
| 1.2 | Клиент–сервер и слоистая архитектура | presentation / application / domain / infrastructure, чистая архитектура, зависимости внутрь | — |
| 1.3 | Монолит → модульный монолит → микросервисы | связность/зацепление, границы сервисов, цена распределённости, Conway's law | ADR-01 «стиль декомпозиции» |
| 1.4 | API-стили и контракты | REST, GraphQL, gRPC, OpenAPI, версионирование, обратная совместимость | OpenAPI-контракт ядра |
| 1.5 | Состояние и данные: реляционка | PostgreSQL, нормализация, транзакции, ACID, индексы, миграции expand-contract | ER-модель + миграция |
| 1.6 | Кэш, очереди, событийность | Redis, Kafka/RabbitMQ, идемпотентность, outbox, eventual consistency | sequence-диаграмма event-flow |
| 1.7 | Файлы и медиа | объектное хранилище, presigned URL, CDN, обработка загрузок | — |
| 1.8 | Идентичность и доступ | сессии vs JWT, OAuth 2.1 / OIDC, RBAC/ABAC, refresh-rotation | диаграмма auth-потока |
| 1.9 | Наблюдаемость | структурные логи, метрики, трейсы, golden signals, 12-factor | — |
| 1.10 | Масштаб и отказоустойчивость | LB, реплики, шардирование, CAP/PACELC, деградация, backpressure | ADR-02 «consistency vs availability» |
| 1.11 | Безопасность и поставка | OWASP ASVS, секреты, CI/CD, IaC, threat-model классической схемы | C4 Container-диаграмма «классика» |

### Модуль 2 · Облачный Google подход (11 уроков)

> Та же сетка кирпичей, но managed-first на Google Cloud.

| # | Урок | Что внутри | Артефакт |
|---|------|-----------|----------|
| 2.1 | Философия Google Cloud | managed-first, SRE, Architecture Framework, error budget, цена владения | — |
| 2.2 | Compute | Cloud Run, GKE Autopilot, App Engine, Cloud Functions — матрица выбора | ADR-03 «runtime» |
| 2.3 | Данные | Cloud SQL, AlloyDB, Spanner, Firestore, Bigtable — критерии выбора, согласованность | схема данных на GCP |
| 2.4 | Аналитика и события | BigQuery, Pub/Sub, Dataflow, Eventarc, event-driven serverless | event-flow на Pub/Sub |
| 2.5 | Хранилище и доставка | Cloud Storage классы, Cloud CDN, Media CDN, подписанные URL | — |
| 2.6 | Identity | Cloud IAM, Identity Platform / Firebase Auth, Workload Identity Federation | auth-поток на GCP |
| 2.7 | Сеть и периметр | VPC, Serverless VPC Access, Cloud Load Balancing, Cloud Armor, Apigee/API Gateway | — |
| 2.8 | Секреты и ключи | Secret Manager, Cloud KMS, CMEK/CSEK, ротация | — |
| 2.9 | Observability | Cloud Logging/Monitoring/Trace/Profiler, SLO и error budget по SRE | SLO-спецификация |
| 2.10 | Доставка и IaC | Cloud Build, Artifact Registry, Cloud Deploy, Terraform / Config Connector | pipeline-диаграмма |
| 2.11 | Эталонная архитектура на Google | serverless backend + Firebase + BigQuery, чек-лист стоимости/SRE, lock-in анализ | C4 Container-диаграмма «Google» |

### Модуль 3 · Децентрализованные аналоги, альтернативы и подходы (13 уроков)

> Для каждого кирпича модулей 1–2 — децентрализованный аналог, его цена и
> граница применимости.

| # | Урок | Что внутри | Аналог чему | Артефакт |
|---|------|-----------|-------------|----------|
| 3.1 | Карта соответствий | таблица «классика ↔ Google ↔ децентрализация» по 9 кирпичам, спектр децентрализации | всему | матрица-черновик |
| 3.2 | Децентрализованный compute | Akash (SDL), Fluence, Golem, Flux — модель, оплата, доверие к ноде | Cloud Run / GKE | ADR-04 «compute» |
| 3.3 | Блокчейн как backend | EVM, смарт-контракты, аккаунты/газ, EIP-1559, детерминизм | application-слой | — |
| 3.4 | Состояние: on-chain vs off-chain | цена storage, события/логи, индексация через The Graph | БД / индекс | data-схема on/off-chain |
| 3.5 | Децентрализованное хранилище | IPFS/Filecoin, Arweave (permaweb), Storj — content addressing, pinning | Cloud Storage | — |
| 3.6 | Децентрализованная доставка | IPFS-шлюзы, Fleek, AIOZ, кэш и латентность p2p | Cloud CDN | — |
| 3.7 | Децентрализованная идентичность | кошелёк, SIWE (EIP-4361), DID/Verifiable Credentials, ENS | Cloud IAM / OIDC | auth-поток на кошельке |
| 3.8 | Данные и сообщения p2p | Ceramic, OrbitDB, Gun, libp2p pubsub, CRDT | Firestore / Pub/Sub | — |
| 3.9 | Оракулы и внешний мир | Chainlink, мост on/off-chain, доверенные фиды, keeper'ы | интеграции / функции | — |
| 3.10 | Приватность и ключи | самокастодиальные кошельки, MPC, account abstraction (ERC-4337), ZK-доказательства | KMS / Secret Manager | ADR-05 «управление ключами» |
| 3.11 | Наблюдаемость децентрализованных систем | The Graph, Dune, RPC/ноды, мониторинг финализации и реоргов | Cloud Monitoring | — |
| 3.12 | Управление и поставка | DAO, on-chain governance, аудит контрактов, детерминированные сборки, upgradeability | IAM / CI-CD / governance | — |
| 3.13 | Эталонная гибридная архитектура · Capstone | сведение трёх проекций, матрица выбора, что централизовать/децентрализовать | всему | C4 + матрица + ADR-набор |

---

## 4. Сквозной проект и артефакты

Один продукт проходит через все три модуля. На выходе каждого модуля —
**C4-диаграмма** (Context + Container) и набор **ADR** для спорных решений.
Capstone (урок 3.13) объединяет их в:

- единую **матрицу выбора** 9 кирпичей × 3 парадигмы (с trade-off),
- **эталонную гибридную архитектуру** (обоснованный микс),
- **threat-model** и оценку суверенитета данных / vendor lock-in.

---

## 5. Sandboxes (изолированные среды для практики)

| Sandbox | Стек | Зачем |
|---|---|---|
| `sandbox-classic` | docker-compose: API + PostgreSQL + Redis + Kafka + MinIO | пощупать классические кирпичи без облака |
| `sandbox-gcp-lite` | Cloud Code эмуляторы: Firestore/Pub-Sub/Storage emulators + LocalStack-аналоги | GCP-паттерны без счёта |
| `sandbox-chain` | Anvil/Hardhat + локальный IPFS Kubo + локальный The Graph node | блокчейн+storage+индекс локально |
| `sandbox-depin` | Akash CLI + локальная нода + libp2p demo | DePIN-деплой без оплаты |

---

## 6. Критерии завершения курса

Сертификат выдаётся, если студент:

1. Сдал C4-диаграммы (Context + Container) по **каждому** из 3 модулей.
2. Оформил минимум 5 ADR (по одному на каждое спорное решение из плана).
3. Сдал **Capstone**: матрица выбора 9×3 + эталонная гибридная архитектура
   с письменным обоснованием trade-off и threat-model.
4. Защитил выбор «что централизовать / отдать Google / децентрализовать» —
   с цифрами по стоимости, латентности и суверенитету данных.

---

## 7. Дорожная карта (примерно 7 недель)

| Нед. | Модуль | Главный артефакт |
|---|---|---|
| 1 | 1 (1.1–1.6) | C4 Context + ER-модель |
| 2 | 1 (1.7–1.11) | C4 Container «классика» + ADR-01/02 |
| 3 | 2 (2.1–2.6) | схема данных + auth на GCP |
| 4 | 2 (2.7–2.11) | C4 Container «Google» + SLO + ADR-03 |
| 5 | 3 (3.1–3.6) | карта соответствий + ADR-04 |
| 6 | 3 (3.7–3.12) | auth на кошельке + ADR-05 |
| 7 | 3 (3.13) | **Capstone**: матрица 9×3 + гибрид |

---

## 8. Связь с другими курсами Academy

- **`web3-genesis`** → даёт глубину по смарт-контрактам и кошелькам;
  здесь они встроены в общую архитектуру как один из кирпичей.
- **`cicd-devsecops`** → закрывает «как доставлять» каждую из трёх проекций
  (pipeline, секреты, supply chain).
- **`claude-code`** → агентная автоматизация ADR-ревью и генерации
  C4-диаграмм.
