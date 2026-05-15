# Module 8 — Cloud Practices: AWS, Azure, GCP

> OIDC-федерация без long-lived ключей, K8s в облаке (EKS/AKS/GKE), Secrets
> Manager / Key Vault / Secret Manager, IaC через Terraform/OpenTofu + Atlantis
> + tfsec/checkov, FinOps через infracost, multi-cloud DR.

---

## 8.1 · AWS: IAM, OIDC, ECR/EKS, Secrets Manager

**Канон:** [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/),
[Configuring OpenID Connect in AWS](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services),
[IAM Roles for Service Accounts (IRSA)](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html),
[AWS Secrets Manager rotation](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets.html).

### Никаких static AWS keys в CI — только OIDC

**Trust policy** на IAM role:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:me/app:ref:refs/heads/main"
      }
    }
  }]
}
```

GH Actions:

```yaml
permissions: { id-token: write, contents: read }
steps:
  - uses: aws-actions/configure-aws-credentials@SHA
    with:
      role-to-assume: arn:aws:iam::123456789012:role/gh-actions-deploy
      aws-region: eu-west-1
  - run: aws ecr get-login-password | docker login ...
```

**Что выиграли:** в GH Secrets нет `AWS_ACCESS_KEY_ID`. Скомпрометированный
GH-токен **не** даёт доступа в AWS — нужен ещё OIDC-trust с правильным `sub`.

### IRSA для подов в EKS

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: app
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123:role/app-role
```

Pod с этой SA получает temporary AWS credentials через IMDS proxy. Доступ
ограничен IAM policy роли. Никаких ключей в env.

### Secrets Manager + автоматическая ротация

```hcl
resource "aws_secretsmanager_secret" "db" { name = "prod/db" }

resource "aws_secretsmanager_secret_rotation" "db" {
  secret_id           = aws_secretsmanager_secret.db.id
  rotation_lambda_arn = aws_lambda_function.rotator.arn
  rotation_rules { automatically_after_days = 30 }
}
```

ESO (Module 5) подхватит ротированное значение.

**Лаба 23** — GH Actions деплоит в EKS через OIDC, секрет в Secrets Manager,
поды используют IRSA.

---

## 8.2 · Azure: Entra ID, AKS, ACR, Key Vault

**Канон:** [Azure Cloud Adoption Framework](https://learn.microsoft.com/azure/cloud-adoption-framework/),
[Workload Identity Federation in Entra](https://learn.microsoft.com/entra/workload-id/workload-identity-federation),
[AKS Workload Identity](https://learn.microsoft.com/azure/aks/workload-identity-overview),
[Key Vault soft-delete & purge protection](https://learn.microsoft.com/azure/key-vault/general/soft-delete-overview).

### Federated credentials (без secret client_id+secret)

В App Registration → Federated credentials → «GitHub Actions deploying»:

```
Issuer:   https://token.actions.githubusercontent.com
Subject:  repo:me/app:ref:refs/heads/main
Audience: api://AzureADTokenExchange
```

```yaml
- uses: azure/login@SHA
  with:
    client-id:      ${{ secrets.AZURE_CLIENT_ID }}
    tenant-id:      ${{ secrets.AZURE_TENANT_ID }}
    subscription-id:${{ secrets.AZURE_SUBSCRIPTION_ID }}
```

Никакого `client-secret` в GH Secrets.

### AKS Workload Identity (аналог IRSA)

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: app
  annotations:
    azure.workload.identity/client-id: <APP_CLIENT_ID>
```

```yaml
# Pod
spec:
  serviceAccountName: app
  containers:
    - name: app
      image: ...
      env:
        - name: AZURE_CLIENT_ID
          value: <APP_CLIENT_ID>
```

### Key Vault — обязательно

- `Soft-delete: enabled` (минимум 7 дней — recovery после случайного удаления).
- `Purge protection: enabled` (нельзя hard-delete до окончания SD-периода).
- `RBAC` (не legacy access policies) — gran granularity.
- `Private endpoint` для production.

---

## 8.3 · GCP: Workload Identity Federation, GKE, Artifact Registry

**Канон:** [GCP SRE book](https://sre.google),
[Workload Identity Federation (WIF)](https://cloud.google.com/iam/docs/workload-identity-federation),
[GKE Workload Identity](https://cloud.google.com/kubernetes-engine/docs/concepts/workload-identity),
[GCP Secret Manager + rotation](https://cloud.google.com/secret-manager/docs/about-rotation-schedules).

### WIF для GH Actions

```hcl
resource "google_iam_workload_identity_pool" "gh" {
  workload_identity_pool_id = "gh-pool"
}

resource "google_iam_workload_identity_pool_provider" "gh" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.gh.workload_identity_pool_id
  workload_identity_pool_provider_id = "gh-provider"
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }
  attribute_condition = "assertion.repository=='me/app'"
}
```

```yaml
- uses: google-github-actions/auth@SHA
  with:
    workload_identity_provider: projects/123/locations/global/workloadIdentityPools/gh-pool/providers/gh-provider
    service_account: gh-deployer@myproject.iam.gserviceaccount.com
```

Без `credentials_json` в GH Secrets. (Это **большой** скачок безопасности —
JSON service account key обычно живёт годами и утекает в логи.)

### GKE Workload Identity

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: app
  annotations:
    iam.gke.io/gcp-service-account: app@myproject.iam.gserviceaccount.com
```

Pod использует SA, под капотом GKE прокси-сервис выдаёт временный GCP-token.

---

## 8.4 · IaC: Terraform/OpenTofu + Atlantis + tfsec/checkov

**Канон:** [Terraform docs](https://developer.hashicorp.com/terraform/docs),
[OpenTofu (fork)](https://opentofu.org),
[Atlantis docs](https://www.runatlantis.io),
[tfsec](https://aquasecurity.github.io/tfsec/), [Checkov](https://www.checkov.io),
[Crossplane](https://docs.crossplane.io), [Pulumi](https://www.pulumi.com/docs/).

### Что выбрать

| | Terraform | OpenTofu | Pulumi | Crossplane |
|---|---|---|---|---|
| Лицензия | BUSL (с 2023) | MPL-2.0 ✓ FOSS | Apache 2 | Apache 2 |
| Язык | HCL | HCL | TS/Go/Python/C# | YAML + CRDs |
| Best for | mainstream | OSS-only-policy | dev-heavy | k8s-native |

**Совет:** для большинства — OpenTofu (форк Terraform после смены лицензии,
drop-in compatible). Pulumi — если у вас сильная dev-команда, не хочется HCL.
Crossplane — если вы уже в k8s по уши, и хочется GitOps для AWS/GCP-ресурсов.

### Atlantis: PR-driven Terraform

```yaml
# atlantis.yaml
version: 3
projects:
  - dir: infra/prod
    workspace: prod
    workflow: prod
    autoplan: { when_modified: ["*.tf", "*.tfvars"], enabled: true }
    apply_requirements: [approved, mergeable]
workflows:
  prod:
    plan:
      steps:
        - run: tfsec --soft-fail .
        - run: checkov -d . --skip-check CKV_AWS_8 --quiet
        - init
        - plan
```

В PR появляется auto-generated plan + tfsec/checkov-результаты. Apply делается
после approve и merge.

**Безопасность:**

- Atlantis сам не должен ходить в prod с long-lived ключами — он берёт
  временные через OIDC (или IRSA, если в EKS).
- Policy-as-Code: `OPA/Conftest` или `Sentinel` (если Terraform Cloud).

**Лаба 24** — Terraform + Atlantis + tfsec в PR.

---

## 8.5 · FinOps в CI/CD

**Канон:** [FinOps Foundation framework](https://www.finops.org/framework/),
[infracost docs](https://www.infracost.io/docs/),
[OpenCost](https://www.opencost.io).

**infracost** в PR — показывает diff стоимости от изменения IaC.

```yaml
- uses: infracost/actions/setup@SHA
- run: infracost breakdown --path=. --format=json --out-file=infracost.json
- uses: infracost/actions/comment@SHA
  with:
    path: infracost.json
    behavior: update
```

В PR появляется комментарий:

```
Monthly cost diff:  +$87.40 (+12%)
└─ aws_instance.web   +1 instance ($73.00)
└─ aws_rds_instance   tier change ($14.40)
```

Гейтим merge, если > $X (configurable).

**OpenCost / Kubecost** — runtime FinOps в k8s. Видим, сколько стоит каждый
namespace/label/Deployment.

---

## 8.6 · Multi-cloud DR

**Канон:** [Google SRE — Disaster Recovery](https://sre.google/sre-book/managing-incidents/),
[AWS Multi-Region patterns](https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html),
[Azure recommended DR patterns](https://learn.microsoft.com/azure/architecture/framework/resiliency/),
[Velero docs](https://velero.io/docs/).

**4 паттерна** (от дешёвого к дорогому):

1. **Backup & Restore** — RTO часы/дни, RPO часы.
2. **Pilot light** — критичные части подняты в DR-region, остальное по триггеру.
   RTO десятки минут.
3. **Warm standby** — уменьшенная копия системы готова. RTO минуты.
4. **Multi-site active-active** — нагрузка балансируется между регионами.
   RTO ~0, но самая дорогая.

**Multi-cloud** усложняет: разные API, разная цена egress, разные модели
IAM. Используйте, только если ну очень нужно (compliance/lock-in).

**Чаще выбираем:** multi-region внутри одного облака (cheaper, simpler), а
multi-cloud — только для **критичной** части (DNS, storage с GeoCopy).

---

## Чек-лист модуля

- [ ] AWS: OIDC → IAM role, IRSA для подов, Secrets Manager rotation 30d.
- [ ] Azure: Federated credentials, Workload Identity, Key Vault soft-delete + purge protection + RBAC.
- [ ] GCP: WIF (без JSON-key), GKE Workload Identity, Secret Manager rotation.
- [ ] IaC: tfsec + checkov + Atlantis-driven approval, OPA-policies.
- [ ] infracost в PR, гейт по абсолютному порогу.
- [ ] DR-pattern выбран сознательно (RTO/RPO документированы).

## Лабы модуля

- [Lab 23 — GH→AWS через OIDC](../../labs/23-aws-oidc/)
- [Lab 24 — Terraform + Atlantis + tfsec](../../labs/24-terraform-atlantis/)
