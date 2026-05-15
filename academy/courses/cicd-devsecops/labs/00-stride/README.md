# Lab 00 — STRIDE-карта моего репозитория

> Модуль 0 · Время: 2 ч · Sandbox: не нужен · DSOMM: *Culture — Threat modeling per design*

## Задача

Сделать threat-model вашего реального (или fork'нутого) репо по методу STRIDE
и положить результат в `THREAT_MODEL.md`. Это станет «paspport»-документом,
который мы будем дополнять до конца курса.

## Шаги

1. **Нарисуйте DFD** (data flow diagram) пайплайна. Минимум 4 уровня:
   - Developer's laptop
   - Git host (GitHub / Gitea)
   - CI runner
   - Artifact registry + deploy target
   Используйте Mermaid (или Draw.io / [pytm](https://github.com/izar/pytm)).

   ```mermaid
   graph LR
     Dev[👤 Developer] -- git push --> GH[GitHub repo]
     GH -- webhook --> CI[Runner]
     CI -- push image --> Reg[Registry]
     Reg --> Cluster[k8s prod]
     CI -- creds --> Secrets[Vault]
   ```

2. **Найдите trust boundaries** (помечайте пунктиром): между Dev и GH,
   между GH и CI, между CI и cloud, между Registry и Cluster.

3. **Для каждой границы** примените 6 вопросов STRIDE. Запишите минимум
   **5 угроз** с приоритетом (H/M/L) и предлагаемой митигацией.

4. **Свяжите с курсом**: для каждой угрозы укажите, в каком модуле она
   закрывается (например, «*M.S1: подмена identity при push → решается в
   Module 5 (signed commits + WebAuthn)*»).

## Шаблон `THREAT_MODEL.md`

```markdown
# Threat Model: <repo-name>

## Diagram

[mermaid DFD here]

## Trust boundaries

| ID | From | To | Description |
|----|------|----|-------------|
| TB1 | Dev laptop | GitHub | network + identity |
| TB2 | GitHub | Runner | webhook trigger |
| TB3 | Runner | Cloud (AWS) | API access |
| TB4 | Registry | Cluster | image pull |

## Threats

| ID | Boundary | STRIDE | Threat | Likelihood | Impact | Mitigation | Module |
|----|----------|--------|--------|------------|--------|------------|--------|
| T1 | TB1 | S | dev лаптоп украден → push с украденной identity | M | H | passkey 2FA + signed commits | 5 |
| T2 | TB3 | E | runner получил больше прав, чем нужно | H | H | least-privilege OIDC + scoped role | 8 |
| T3 | TB2 | T | злоумышленник перепишет tag actions/checkout | M | H | pin by SHA + Renovate | 4 |
| ... |
```

## Acceptance

- [ ] `THREAT_MODEL.md` в корне fork'а с диаграммой и таблицей.
- [ ] Минимум 5 угроз, все 6 категорий STRIDE покрыты ≥ 1 раз.
- [ ] Каждая угроза имеет mitigation и ссылку на модуль курса.
- [ ] Commit подписан (gitsign / GPG) — даже если ещё не настроили required
      check, тренируйтесь.

## Rubric

| Балл | Условие |
|---|---|
| 0 | нет файла |
| 1 | есть диаграмма и < 5 угроз |
| 2 | 5+ угроз, все STRIDE |
| 3 | + likelihood/impact оценки |
| 4 | + mitigation привязаны к модулям курса |
| 5 | + автоматизация: pytm-скрипт генерит часть diagram'ы |
