# Module 9 — DePIN & Decentralized Infrastructure

> Decentralized Physical Infrastructure Networks: Akash для compute, IPFS/Filecoin
> для хранения, гибридный деплой с AWS, и когда это вообще оправдано.

---

## 9.1 · DePIN: модель и экономика

**Канон:** [Akash docs](https://docs.akash.network),
[Render docs](https://docs.rendernetwork.com),
[IO.net](https://docs.io.net),
[Helium](https://docs.helium.com),
[Filecoin docs](https://docs.filecoin.io),
[Arweave Yellow Paper](https://www.arweave.org/yellow-paper.pdf).

**DePIN** — это блокчейн-инсентив + физическое железо. Провайдеры (вы, я,
дата-центр) поставляют ресурс (CPU/GPU/storage/радиосигнал), пользователи
платят токеном.

**Когда оправдано:**

- Высокая стоимость egress в AWS/GCP (DePIN часто без egress fee).
- GPU-нагрузки (IO.net/Render значительно дешевле AWS GPU).
- Чувствительность к **vendor lock-in** или geopolitical risk.
- Архивное хранение (Filecoin/Arweave — pay-once-store-forever).
- Censorship-resistance (open-source, dissent).

**Когда **не** оправдано:**

- Low-latency RT-сервисы (узлы географически разбросаны, RT не гарантирован).
- Compliance с PCI-DSS / HIPAA / GDPR (трудно подписать DPA с децентрализованной
  сетью).
- Production-доступ с SLA 99.99% (DePIN-SLA обычно 99.5–99.9%).
- Гипер-secret workloads, где compromised node ≡ disaster.

**Threat model:**

| Угроза | Контрмера |
|---|---|
| Compromised node читает память контейнера | encryption at rest + memory + confidential compute (TEE/AMD SEV/Intel SGX) |
| Node MITM-ит трафик | mTLS + cert-pinning |
| Node фейкует metrics | independent verification (Prom external pull) |
| Network split / censorship | multi-provider deploy + fail-over |

---

## 9.2 · Деплой в Akash + артефакты на Filecoin/IPFS

**Канон:** [Akash SDL spec](https://docs.akash.network/getting-started/stack-definition-language),
[web3.storage docs](https://docs.storacha.network),
[IPFS Kubo CLI](https://docs.ipfs.tech/install/command-line/),
[Filecoin storage providers](https://docs.filecoin.io/storage-providers/).

### Akash SDL (Stack Definition Language)

```yaml
---
version: "2.0"
services:
  web:
    image: ghcr.io/me/app@sha256:abc...       # digest, не tag — критично!
    expose:
      - port: 8080
        as: 80
        to: [{ global: true }]
profiles:
  compute:
    web:
      resources:
        cpu: { units: 1 }
        memory: { size: 512Mi }
        storage: { size: 1Gi }
  placement:
    dcloud:
      attributes: { host: akash }
      signedBy: { anyOf: ["akash1..."] }      # доверяем подписанным аудиторам
      pricing:
        web: { denom: uakt, amount: 1000 }
deployment:
  web:
    dcloud:
      profile: web
      count: 1
```

```bash
# Создаём deployment, ждём bids, выбираем provider, lease
akash tx deployment create deploy.yml --from $WALLET --gas auto
akash query market bid list --owner $OWNER
akash tx market lease create --provider $PROVIDER ...
# Отправляем манифест выбранному провайдеру
akash provider send-manifest deploy.yml --provider $PROVIDER --from $WALLET
```

### Артефакты на IPFS/Filecoin

```bash
# IPFS Kubo
ipfs add -r ./dist                  # → CID Qm...
ipfs name publish /ipfs/Qm...        # IPNS-указатель (как DNS)

# или web3.storage (управляемый Filecoin pinning)
w3 up ./dist                         # автоматический pinning
```

CID в адресе **гарантирует** content integrity — IPFS-имя это хеш контента.
Подмена невозможна (изменится сам адрес).

**Использование в проде:**

- SBOM/SLSA-провенанс храним в Filecoin (immutable archive).
- Static-сайты раздаём через IPFS-gateway (`https://cf-ipfs.com/ipfs/$CID`)
  + кэшируем через Cloudflare.
- Артефакты релиза дублируем `ghcr.io` (быстро) + `ipfs://` (immutable).

**Лаба 25** — публикация контейнера в Akash + артефакт SBOM в IPFS, верификация.

---

## 9.3 · Гибридный деплой: GH Actions → Akash, fallback AWS

```yaml
jobs:
  deploy:
    runs-on: ubuntu-24.04
    steps:
      - name: Deploy to Akash (primary)
        id: akash
        continue-on-error: true
        run: |
          akash tx deployment create deploy.yml --from $WALLET ...
          # health-check
          curl --fail https://akash-deployment.example.com/health

      - name: Fallback to AWS EKS
        if: steps.akash.outcome == 'failure'
        run: |
          aws eks update-kubeconfig --name my-cluster
          kubectl apply -f k8s/
```

**Threat model гибрида:**

- DNS управляется одним provider (Cloudflare/Route53). При его падении —
  ни Akash, ни AWS не доступны → нужен **multi-DNS** (anycast + secondary).
- mTLS-сертификаты у обоих провайдеров одинаковые → ключ должен быть в Vault,
  а не в env-var каждой среды.

---

## 9.4 · DePIN-протоколы для backend & frontend: установка, запуск, оплата

**Канон:** [Akash docs](https://docs.akash.network),
[Fleek docs](https://fleek.xyz/docs/),
[Spheron docs](https://docs.spheron.network),
[Flux docs](https://docs.runonflux.io).

Один Akash — это ещё не «поликлауд». Ниже — четыре зрелых DePIN-протокола,
которыми реально поднимают **и backend, и frontend**. Для каждого: что ставим,
как запускаем оба яруса, как платим и где подводные камни.

> **Главное правило оплаты в DePIN:** вы не платите по карте «постфактум».
> Вы вносите **депозит в escrow** (AKT/USDC/FLUX/SPON), и сеть **списывает
> посекундно/поблочно**, пока lease жив. Кончился баланс — pod убит. Поэтому
> в проде нужен мониторинг баланса escrow + авто-topup (cron/Action).

### 1. Akash Network — универсальный compute (backend + frontend в контейнерах)

**Назначение:** любой Docker-workload. Backend (API/БД/worker) и frontend
(nginx со статикой) живут как обычные сервисы в одном SDL.

**Установка:**

```bash
curl -sfL https://raw.githubusercontent.com/akash-network/provider/main/install.sh | bash
export PATH="$PATH:./bin"
provider-services keys add wallet            # генерим кошелёк
# пополняем кошелёк AKT (CEX/DEX) либо USDC через Noble/IBC
```

**Запуск (backend + frontend в одном deployment):**

```yaml
# deploy.yml — SDL v2.0
services:
  api:                                   # backend
    image: ghcr.io/me/api@sha256:abc...   # ВСЕГДА digest, не tag
    env: [ "DB_DSN=postgres://..." ]
    expose: [ { port: 8080, to: [{ global: true }] } ]
  web:                                   # frontend
    image: ghcr.io/me/web@sha256:def...
    expose: [ { port: 80, as: 80, to: [{ global: true }] } ]
```

```bash
provider-services tx deployment create deploy.yml --from wallet --gas auto
provider-services query market bid list --owner $OWNER     # ждём bids
provider-services tx market lease create --provider $PROVIDER ...
provider-services send-manifest deploy.yml --provider $PROVIDER --from wallet
```

**Оплата:** reverse-auction — провайдеры **бидуют ценой вниз**. Депозит AKT
(min ~0.5 AKT) в escrow деплоя, списание поблочно (~6 с). Поддерживается
оплата **USDC**. Закрыли deployment → невыработанный остаток вернулся.

**Особенности:** нет egress-fee; есть GPU и persistent storage; TLS — сам
(provider ingress + Cloudflare/cert-manager); lease смертен — мониторь баланс.

### 2. Fleek — frontend на IPFS/Filecoin + Fleek Functions (edge-backend)

**Назначение:** SPA/статика на IPFS с ENS/CDN + лёгкий backend как
edge-функции (V8-isolates). Идеально для Jamstack.

**Установка:**

```bash
npm i -g @fleek-platform/cli
fleek login                              # OAuth, проектный API-token
```

**Запуск frontend:**

```bash
fleek sites init                         # привязка build-папки (dist/)
fleek sites deploy                       # build → IPFS pin → CDN + ENS/DNS
```

**Запуск backend (Fleek Functions):**

```bash
fleek functions create --name api
fleek functions deploy --path ./api.js   # stateless edge JS/TS
```

**Оплата:** подписка Fleek + credits (карта **или** crypto), есть free-tier
для hobby. Storage — Filecoin/IPFS pinning; Functions тарифицируются по
числу вызовов и CPU-времени.

**Особенности:** лучший DX для статики, авто-pinning + ENS + кастомный домен;
**но** Functions stateless и с лимитом времени — тяжёлый stateful backend
(БД, long-running worker) сюда не кладём.

### 3. Flux — FluxOS: Docker-приложения (backend + frontend) с HA из коробки

**Назначение:** always-on self-hosted приложения. Каждое приложение
запускается **минимум на 3 нодах** → встроенная георедундантность, LB и
Let's Encrypt-домен через FDM (Flux Domain Manager).

**Установка / деплой (без своей ноды — через Flux SSP/Zelcore + CLI):**

```bash
# спецификация приложения (compose-подобный JSON):
# name, compose[{ image (с checksum), ports, environment }],
# instances >= 3, resources (cpu/ram/hdd), expire (в блоках)
flux-cli registerapp ./app-spec.json     # подписываем кошельком, платим FLUX
```

**Запуск backend + frontend:** оба — это compose-компоненты одного app-spec
(`api` + `web` контейнеры). Домен `app.runonflux.io` (или custom) с
авто-LB/SSL; persistent — Flux Storage/IPFS.

**Оплата:** регистрация и runtime — в **FLUX**, цена = f(ресурсы × число
инстансов × срок). Подписка **истекает** (expire-блок) — нужен `extendapp`
(renew), иначе приложение снимается.

**Особенности:** HA «из коробки» (≥3 реплики, FDM LB+SSL), reproducible
(image по checksum); платишь за HA — дороже single-node; хорош для
always-on backend+frontend без облака.

### 4. Spheron — decentralized compute marketplace (GPU/AI backend + frontend)

**Назначение:** GPU/CPU-marketplace (Fizz-ноды). Силён для AI/inference
backend; frontend-контейнер тоже поднимается.

**Установка:**

```bash
curl -sL https://sphnctl.sh | bash       # или: npm i -g @spheron/cli
sphnctl wallet create
sphnctl wallet deposit --amount 20 --token USDC   # escrow-депозит
```

**Запуск (ICL-манифест, идейно как Akash SDL):**

```bash
sphnctl deployment create deploy.yaml    # services: api (gpu) + web
sphnctl deployment get <id>              # URL + статус
```

**Оплата:** депозит **USDC/CST** в escrow, биллинг **посекундный**,
прозрачный прайс за GPU-час; остаток депозита возвращается при закрытии.

**Особенности:** GPU-first, прозрачный per-second pricing, ICL ≈ SDL;
для тяжёлого AI-backend — топ, чистый frontend дешевле отдать через Fleek.

### Матрица выбора

| Протокол | Backend | Frontend | Оплата | Брать когда |
|---|---|---|---|---|
| **Akash** | ✅ любой контейнер | ✅ nginx/static | AKT/USDC escrow, reverse-auction, поблочно | универсальный поликлауд, GPU, нет egress-fee |
| **Fleek** | ⚠️ только edge-functions | ✅✅ IPFS+ENS+CDN | подписка/credits (fiat/crypto), free-tier | Jamstack/SPA + лёгкий serverless API |
| **Flux** | ✅ Docker, HA ≥3 | ✅ Docker/static | FLUX, подписка с expire | always-on self-hosted с HA из коробки |
| **Spheron** | ✅✅ GPU/AI | ✅ контейнер | USDC escrow, per-second | AI/inference-backend, GPU-нагрузки |

**Правило:** frontend → Fleek (DX + ENS); универсальный backend → Akash;
always-on HA-стек → Flux; GPU/AI-backend → Spheron. В проде —
multi-provider + fallback на централизованного провайдера (см. 9.3).

---

## Чек-лист модуля

- [ ] Решение о DePIN — осознанное, не «хайп» (есть метрика выгоды).
- [ ] Threat model документирована (compromised node ≠ конец света).
- [ ] Контейнер в Akash запинен по digest, не tag.
- [ ] SBOM/провенанс продублирован в IPFS/Filecoin.
- [ ] Fallback на централизованного провайдера прописан и проверен.
- [ ] mTLS / encryption at rest для всех данных в DePIN.
- [ ] Протокол выбран по ярусу: frontend/backend → подходящая сеть (9.4).
- [ ] Баланс escrow (AKT/USDC/FLUX) под мониторингом + авто-topup.
- [ ] Flux/Akash подписка/lease имеет renew-автоматизацию (не истечёт молча).

## Лабы модуля

- [Lab 25 — Akash deploy + IPFS artifacts](../../labs/25-akash-ipfs/)
