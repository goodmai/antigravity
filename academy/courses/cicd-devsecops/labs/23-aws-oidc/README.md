# Lab 23 — GH Actions → AWS через OIDC, без long-lived ключей

> Модуль 8 · 2 ч · Sandbox: LocalStack (для бесплатной тренировки) или real AWS · DSOMM: *Implementation — Short-lived credentials*

## Задача

Настроить OIDC-provider в AWS IAM, создать role с trust policy на ваш репо,
GH Actions деплоит в S3 без `AWS_ACCESS_KEY_ID` в secrets.

## Шаги

1. **IAM OIDC provider** (если ещё нет):
   ```bash
   aws iam create-open-id-connect-provider \
     --url https://token.actions.githubusercontent.com \
     --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 \
     --client-id-list sts.amazonaws.com
   ```
2. **IAM role** с trust policy (см. lesson 8.1) — sub конкретный repo/ref.
3. **Inline-policy**: `s3:PutObject` на бакет.
4. **Workflow** (см. lesson 8.1).
5. **Демо нарушение**: переключите trust policy на `repo:other-org/*` —
   `AssumeRoleWithWebIdentity` падает.
6. **Бонус**: то же на LocalStack для air-gapped тренировки.

## Acceptance

- [ ] В GH Secrets нет `AWS_ACCESS_KEY_ID`.
- [ ] Деплой работает с production-IAM-role.
- [ ] Trust policy ограничивает по `sub` (репо + ветка).
- [ ] CloudTrail event-log показывает event `AssumeRoleWithWebIdentity`.

## Rubric: 1 — login через OIDC; 2 — деплой в S3; 3 — trust по sub; 4 — IRSA для pod'ов в EKS; 5 — full multi-account (dev/stage/prod) с разными roles + audit-log в SIEM.
