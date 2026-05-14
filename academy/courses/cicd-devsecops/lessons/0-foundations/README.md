# Module 0 — Foundations & Mindset

> Зачем: настроить «оптику», без которой остальные модули превратятся в набор
> рецептов. Здесь — метрики, threat modeling и зрелость DevSecOps.

## Уроки

### 0.1 · DevSecOps как поток ценности

**Канон:** DORA «State of DevOps», SPACE framework, Accelerate (Forsgren et al.).

DevSecOps — не «добавить SAST в CI», а **поток создания ценности**:
от commit до пользы пользователю. Безопасность встраивается в каждый шаг,
а не «навешивается» в конце.

**4 ключевые DORA-метрики**:

| Метрика | Elite | Что измеряем |
|---|---|---|
| Lead Time for Changes | < 1 час | от commit до прод |
| Deployment Frequency | on-demand | сколько раз в день |
| Change Failure Rate | 0–15% | % изменений, ломающих прод |
| MTTR / Time to Restore | < 1 час | сколько чиним инцидент |

К ним добавляем 2 DevSec-метрики:
- **Mean Time to Remediate (MTTR-Sec)** — от обнаружения CVE до фикса в проде.
- **% PRs blocked by security gate** — здоровая зона 5–15%; выше — гейт мешает,
  ниже — гейт ничего не ловит.

**Quick win:** в Lab 00 вы посчитаете DORA по своему репозиторию через
[`four-keys`](https://github.com/dora-team/fourkeys) или Cycle Time от GitHub.

### 0.2 · Threat modeling за 30 минут (STRIDE)

**Канон:** Microsoft STRIDE, OWASP Threat Modeling, «Threat Modeling: Designing
for Security» (A. Shostack).

**STRIDE** — шесть классов угроз:

| Буква | Угроза | Контрмера в CI/CD |
|---|---|---|
| **S**poofing | подмена identity | OIDC + 2FA, signed commits, signed images (cosign) |
| **T**ampering | подмена данных/артефактов | provenance + SLSA L3, immutable storage |
| **R**epudiation | отказ от действий | подписанные коммиты, audit log в Rekor |
| **I**nformation disclosure | утечка | секреты в Vault, gitleaks, mTLS |
| **D**enial of Service | отказ в обслуживании | rate-limit на runners, concurrency, quotas |
| **E**levation of privilege | эскалация | least-privilege токены, RBAC, Kyverno |

**Метод за 30 минут:**

1. Рисуем data-flow diagram (DFD) пайплайна: dev → repo → CI → registry → cluster.
2. Помечаем trust-boundaries (где меняется уровень доверия — это «кости» STRIDE).
3. Для каждой границы — 6 вопросов STRIDE.
4. Ставим **DREAD** или **CVSS** для приоритета (или просто H/M/L).

**Лаба 00** — STRIDE-карта вашего реального репозитория.

### 0.3 · Зрелость: OWASP SAMM & DSOMM

**Канон:** [OWASP SAMM 2.x](https://owaspsamm.org), [OWASP DSOMM](https://dsomm.owasp.org),
[NIST SSDF SP 800-218](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf).

**SAMM** делит безопасность на 5 business functions (Governance, Design, Implementation,
Verification, Operations) × 3 практики каждая. По каждой — 3 уровня зрелости.

**DSOMM** более «эксплуатационный» — 4 dimensions (Build & Deployment, Culture &
Organization, Implementation, Information Gathering) × конкретные практики
(«Defined build process», «Signed artifacts», «Reproducible defect tracking»).

**Что делаем на курсе:**

- В Module 0 — self-assessment (текущий уровень).
- В Module 12 — повторный assessment (целевой Level 2+ во всех dimensions).
- В capstone — доказательство Level 3 в нескольких практиках (signed artifacts,
  provenance, SBOM, secret-scanning, infra-as-code, audit log).

**Канон SSDF (NIST SP 800-218):**

- **PO** Prepare the Organization — роли, политики, обучение.
- **PS** Protect the Software — целостность кода, релизных артефактов.
- **PW** Produce Well-Secured Software — secure-by-default, проверки.
- **RV** Respond to Vulnerabilities — VEX, SLA на патчи, дисклоуз.

В каждой лабе будем помечать, какой SSDF-практике это соответствует.

## Лаба

- **Lab 00 — «STRIDE для моего репо»** ([`labs/00-stride/`](../../labs/00-stride/)).
  Сделать DFD, найти 5 угроз, написать митигации в `THREAT_MODEL.md` своего fork'а.

## Чек-лист модуля

- [ ] Считаю свою Lead Time for Changes.
- [ ] Знаю, чем `Spoofing` отличается от `Tampering`.
- [ ] Понимаю, что SAMM ≠ DSOMM ≠ SSDF (а **DSOMM** — самый «DevOps-friendly»).
- [ ] Сделал self-assessment по DSOMM (хотя бы 4 dimensions × 1 практика).
