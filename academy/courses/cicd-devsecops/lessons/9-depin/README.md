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

## Чек-лист модуля

- [ ] Решение о DePIN — осознанное, не «хайп» (есть метрика выгоды).
- [ ] Threat model документирована (compromised node ≠ конец света).
- [ ] Контейнер в Akash запинен по digest, не tag.
- [ ] SBOM/провенанс продублирован в IPFS/Filecoin.
- [ ] Fallback на централизованного провайдера прописан и проверен.
- [ ] mTLS / encryption at rest для всех данных в DePIN.

## Лабы модуля

- [Lab 25 — Akash deploy + IPFS artifacts](../../labs/25-akash-ipfs/)
