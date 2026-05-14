# Module 4 — DevSecOps Core

> SAST (SonarQube/Semgrep/CodeQL), SCA (Dependabot/Renovate/OWASP DC), image-scan
> (Trivy/Grype), secret-scan, supply chain (SLSA/cosign/Rekor/SBOM/Scorecard).

---

## 4.1 · SAST: SonarQube / SonarCloud

**Канон:** [SonarQube docs](https://docs.sonarsource.com/sonarqube/),
[Sonar Way Quality Profiles](https://docs.sonarsource.com/sonarqube/latest/instance-administration/quality-profiles/),
[Sonar Clean as You Code](https://docs.sonarsource.com/sonarqube/latest/user-guide/clean-as-you-code/).

**Quality Gate** — это «фильтр» между PR и merge. Дефолтный *Sonar Way* проверяет:

- coverage на **новом** коде ≥ 80%,
- duplications на новом коде ≤ 3%,
- security hotspots reviewed = 100%,
- maintainability rating new = A,
- reliability rating new = A,
- security rating new = A.

Подход «**Clean as You Code**» — не пытайтесь зачистить весь legacy. Гейтите
только **новый** код. Долг чистится естественно, без революций.

### Локальный SonarQube в docker-compose

```yaml
# docker-compose.yml
services:
  sonarqube:
    image: sonarqube:10-community
    environment:
      SONAR_JDBC_URL: jdbc:postgresql://db:5432/sonar
      SONAR_JDBC_USERNAME: sonar
      SONAR_JDBC_PASSWORD: ${SONAR_DB_PASSWORD}
    ports: ["9000:9000"]
    depends_on: [db]
    ulimits:
      nofile: { soft: 65536, hard: 65536 }
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: sonar
      POSTGRES_USER: sonar
      POSTGRES_PASSWORD: ${SONAR_DB_PASSWORD}
    volumes: [sonar-pg:/var/lib/postgresql/data]
volumes: { sonar-pg: {} }
```

### `sonar-project.properties`

```
sonar.projectKey=me_app
sonar.organization=me
sonar.sources=src
sonar.tests=tests
sonar.javascript.lcov.reportPaths=coverage/lcov.info
sonar.coverage.exclusions=**/*.test.ts,**/migrations/**
sonar.qualitygate.wait=true
```

### GH Actions job (PR-декорация)

```yaml
- uses: actions/checkout@SHA
  with: { fetch-depth: 0 }            # для blame и new-code detection
- uses: SonarSource/sonarqube-scan-action@SHA
  env:
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
    SONAR_HOST_URL: https://sonar.example.com
```

`sonar.qualitygate.wait=true` сделает job красным, если Quality Gate FAIL.

**Альтернатива SonarCloud** (если SaaS) — то же самое, но без своего сервера.
Для open-source — бесплатно.

**Лаба 11** — SonarQube в docker-compose, gate в PR, breaking-change падает CI.

---

## 4.2 · Semgrep / CodeQL

**Канон:** [Semgrep registry](https://semgrep.dev/r),
[CodeQL docs](https://codeql.github.com/docs/),
[OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/).

**Semgrep** — pattern-based, легко писать свои правила:

```yaml
rules:
  - id: hardcoded-aws-key
    pattern-either:
      - pattern: "AKIA$X"
    severity: ERROR
    message: Hardcoded AWS Access Key
    languages: [generic]
```

```bash
semgrep --config=auto --error          # auto = registry + project rules
```

**CodeQL** — глубже (taint analysis, data-flow), но дороже на старте. Лучшее
покрытие для Java/Go/JS/Python/C#/C++.

```yaml
# .github/workflows/codeql.yml
- uses: github/codeql-action/init@SHA
  with: { languages: 'go,javascript' }
- uses: github/codeql-action/autobuild@SHA
- uses: github/codeql-action/analyze@SHA
```

**Когда что:** Semgrep — быстро, кастомные правила; CodeQL — глубокий
taint-анализ + GitHub Security tab.

---

## 4.3 · SCA: Dependabot, Renovate, OWASP DC, Snyk

**Канон:** [Renovate docs](https://docs.renovatebot.com),
[Dependabot docs](https://docs.github.com/en/code-security/dependabot),
[OWASP Dependency-Check](https://owasp.org/www-project-dependency-check/),
[OSV.dev](https://osv.dev), [NVD](https://nvd.nist.gov).

**Renovate vs Dependabot:**

| | Dependabot | Renovate |
|---|---|---|
| Конфиг | YAML, простой | JSON5/JSON, **очень** гибкий |
| Группировка | базовая | rich (по path/manager/regex) |
| Schedule | базовый | cron-like |
| Auto-merge | через GH UI | встроенный, с правилами |
| Self-host | нет | да (whitesource/renovate) |

**Минимальный `renovate.json`:**

```json5
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "config:recommended",
    "schedule:earlyMondays",
    ":semanticCommits",
    ":dependencyDashboard"
  ],
  "timezone": "Europe/Berlin",
  "rangeStrategy": "bump",
  "lockFileMaintenance": { "enabled": true, "schedule": ["before 4am on monday"] },
  "vulnerabilityAlerts": { "labels": ["security"], "automerge": true },
  "packageRules": [
    {
      "matchUpdateTypes": ["patch", "pin"],
      "automerge": true,
      "automergeType": "branch"
    },
    {
      "matchManagers": ["npm"],
      "matchDepTypes": ["devDependencies"],
      "groupName": "npm dev deps"
    },
    {
      "matchDatasources": ["docker"],
      "pinDigests": true                   // pin by sha256:... в манифестах
    }
  ]
}
```

**Что важно:**

- `vulnerabilityAlerts.automerge: true` — патчи уязвимостей сливаются авто-мерджем
  (после CI), не ждут вас.
- `pinDigests: true` для docker — образы запиниваются по digest, не tag.
- `groupName` уменьшает шум: один PR на все dev-deps в неделю.

**OWASP Dependency-Check** — оффлайн SCA по NVD, хорошо для air-gapped
окружений.

**Лаба 12** — Renovate-конфиг с группировкой, автомердж патчей, security-PR
с приоритетом.

---

## 4.4 · Контейнерное сканирование: Trivy, Grype, Dockle

**Канон:** [Trivy docs](https://aquasecurity.github.io/trivy/),
[Grype](https://github.com/anchore/grype),
[Dockle](https://github.com/goodwithtech/dockle),
[CycloneDX](https://cyclonedx.org), [SPDX](https://spdx.dev).

**Trivy** покрывает: OS-packages, language deps (npm/pip/maven/...), IaC
(Terraform/CloudFormation/Kubernetes), secrets, licenses, misconfig.

```bash
trivy image --severity HIGH,CRITICAL \
            --ignore-unfixed \
            --exit-code 1 \
            --format sarif --output trivy.sarif \
            ghcr.io/me/app:${TAG}
```

`--ignore-unfixed` — не падать на CVE без фикса (нечего делать). `--exit-code 1`
гейтит CI. SARIF — заливается в GH Security tab.

**Trivy + SBOM (CycloneDX):**

```bash
trivy image --format cyclonedx --output sbom.cdx.json ghcr.io/me/app:${TAG}
```

SBOM сохраняется как артефакт релиза и/или прикрепляется к образу через
[`oras attach`](https://oras.land) или cosign-attest (см. 4.6).

**Dockle** — проверяет лучшие практики (root user, latest tag, COPY vs ADD,
sensitive data в env).

**Politika:** в CI gate'имся на `HIGH/CRITICAL`, но имеем **`.trivyignore`** с
обоснованием каждой исключённой CVE + срок действия (90 дней).

**Лаба 13** — CI падает на HIGH-CVE в base image, после bump base — зеленеет.

---

## 4.5 · Secret-scanning: gitleaks, trufflehog

**Канон:** [gitleaks](https://github.com/gitleaks/gitleaks),
[trufflehog](https://github.com/trufflesecurity/trufflehog),
[GitHub Advanced Security secret scanning](https://docs.github.com/en/code-security/secret-scanning).

**3 точки проверки:**

1. **Pre-commit** (через husky/lefthook) — DX, отлавливает 90% случаев.
2. **CI** — required check, **нельзя обойти** `--no-verify`.
3. **History scan** — раз в неделю, ищем утечки в **истории** ветки.

```bash
# CI: только staged-diff PR (быстро)
gitleaks detect --redact --no-banner --exit-code 1

# Раз в неделю: всю историю
gitleaks detect --redact --log-opts="--all"
```

**Если секрет уже утёк:**

1. **Немедленно ротейтим** (это первый шаг, не последний).
2. Чистим историю (`git filter-repo`) — но для public-репо считаем, что
   секрет уже скомпрометирован, удаление **не помогает**.
3. Логируем инцидент, делаем post-mortem.

---

## 4.6 · Supply chain: SLSA, cosign, in-toto, Rekor, Scorecard

**Канон:** [SLSA v1.0](https://slsa.dev/spec/v1.0/),
[Sigstore project](https://www.sigstore.dev),
[cosign docs](https://docs.sigstore.dev/cosign/overview/),
[in-toto attestations](https://in-toto.io),
[OpenSSF Scorecard](https://github.com/ossf/scorecard).

### SLSA в одной картинке

| Level | Что требуется |
|---|---|
| **L1** | build process documented |
| **L2** | hosted build platform + signed provenance |
| **L3** | hardened build, isolated, non-falsifiable provenance |
| **L4** | (deprecated в v1.0) two-party review + hermetic |

GH Actions + `slsa-github-generator` даёт **L3** «из коробки» (потому что
provenance подписывается keyless-сертификатом OIDC, который нельзя подделать).

### Keyless подпись cosign + Rekor

```yaml
permissions:
  id-token: write                   # для OIDC → Sigstore Fulcio
  contents: read
  packages: write

steps:
  - uses: sigstore/cosign-installer@SHA
  - run: |
      cosign sign --yes \
        ghcr.io/me/app@${{ steps.build.outputs.digest }}
```

Подпись попадает в **Rekor** — публичный append-only лог. Любой может
проверить:

```bash
cosign verify \
  --certificate-identity="https://github.com/me/app/.github/workflows/release.yml@refs/tags/v1.2.3" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  ghcr.io/me/app@sha256:...
```

### SBOM attestation

```bash
cosign attest --yes \
  --predicate sbom.cdx.json \
  --type cyclonedx \
  ghcr.io/me/app@${DIGEST}
```

### Замыкаем цикл — Kyverno

Из Module 3, lesson 3.5 — Kyverno-политика проверяет именно эту подпись.
**Build → sign → store → verify → run** — закрытый цикл.

### OpenSSF Scorecard

```yaml
# .github/workflows/scorecard.yml
- uses: ossf/scorecard-action@SHA
  with: { results_file: results.sarif, publish_results: true }
```

Получаете оценку 0–10 по 18 чекам (signed-releases, branch-protection,
dangerous-workflow, dependency-update-tool, и т.д.). Если ≥ 7 — публикуете
бейдж OpenSSF Best Practices.

**Лаба 14** — cosign sign + Rekor verify + Kyverno admission-check.

---

## Чек-лист модуля

- [ ] SonarQube gate в PR с *Sonar Way* / *Clean as You Code*.
- [ ] Semgrep `--config=auto` + CodeQL для глубокого анализа.
- [ ] Renovate с auto-merge патчей и pinned digests.
- [ ] Trivy в CI на HIGH/CRITICAL, SBOM CycloneDX как артефакт.
- [ ] gitleaks/trufflehog в pre-commit + CI + история.
- [ ] cosign keyless sign + verify + Rekor transparency log.
- [ ] Kyverno проверяет подпись на admission.
- [ ] OpenSSF Scorecard ≥ 7.

## Лабы модуля

- [Lab 11 — SonarQube + Quality Gate](../../labs/11-sonarqube/)
- [Lab 12 — Renovate config](../../labs/12-renovate/)
- [Lab 13 — Trivy gate на CVE](../../labs/13-trivy/)
- [Lab 14 — cosign + Kyverno](../../labs/14-cosign-kyverno/)
