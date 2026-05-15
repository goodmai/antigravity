# Lab 13 — Trivy gate на CVE

> Модуль 4 · 1 ч · Sandbox: docker · DSOMM: *Implementation — Vulnerability scan*

## Задача

Включить Trivy в CI как gate; сломать сборку на образе с известной HIGH-уязвимостью;
поднять base image — увидеть зелёный CI.

## Шаги

1. Стартовый Dockerfile `FROM node:18-alpine3.16` (заведомо есть CVE).
2. CI:
   ```yaml
   - uses: aquasecurity/trivy-action@SHA
     with:
       image-ref: ghcr.io/me/app:${{ github.sha }}
       severity: HIGH,CRITICAL
       ignore-unfixed: true
       exit-code: 1
       format: sarif
       output: trivy.sarif
   - uses: github/codeql-action/upload-sarif@SHA
     with: { sarif_file: trivy.sarif }
   ```
3. CI красный → bump base до `node:20-alpine3.20` → зелёный.
4. Сгенерить CycloneDX SBOM: `trivy image --format cyclonedx --output sbom.cdx.json …`.
5. Прикрепить SBOM к release: `gh release upload v1.2.3 sbom.cdx.json`.

## Acceptance

- [ ] CI красный на HIGH/CRITICAL.
- [ ] `--ignore-unfixed` не пропускает фиксабельные.
- [ ] SBOM генерируется и прикладывается к релизу.
- [ ] `.trivyignore` с обоснованием и сроком действия.

## Rubric: 1 — Trivy запущен; 2 — CI красный на CVE; 3 — bump чинит; 4 — SBOM; 5 — VEX (Vulnerability Exploitability eXchange) для false-positives.
