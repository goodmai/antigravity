# Lab 14 — cosign keyless + Rekor + Kyverno admission verify

> Модуль 4 · 2 ч · Sandbox: k3d + Sigstore · DSOMM: *Build — Signed artifacts; Operations — Verify provenance*

## Задача

Замкнуть цикл «build → sign → verify»: GH Actions подписывает образ keyless'но
через OIDC (cert от Fulcio, лог в Rekor), Kyverno на admission проверяет, что
запускающийся образ имеет верную подпись.

## Шаги

1. **Build & sign в CI**:
   ```yaml
   permissions: { id-token: write, contents: read, packages: write }
   steps:
     - uses: sigstore/cosign-installer@SHA
     - run: cosign sign --yes ghcr.io/me/app@${{ steps.build.outputs.digest }}
   ```
2. **Kyverno-политика** (см. lesson 3.5) — `verifyImages` с keyless и
   `certificate-identity` = subject вашего workflow.
3. **Тест**: deploy подписанного образа → ok. Скачать незаподписанный образ,
   попробовать deploy — отказ.
4. **Verify локально**:
   ```bash
   cosign verify \
     --certificate-identity-regexp="^https://github.com/me/.+/.github/workflows/.+@.*$" \
     --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
     ghcr.io/me/app@sha256:...
   ```

## Acceptance

- [ ] Кейлесс-подпись висит в публичном Rekor.
- [ ] Kyverno-политика в Enforce-mode.
- [ ] Незаподписанный образ не запускается.

## Rubric: 1 — sign локально; 2 — sign в CI; 3 — verify в Kyverno; 4 — SBOM attest; 5 — TUF-style policy bundle через `policy-controller` (sigstore).
