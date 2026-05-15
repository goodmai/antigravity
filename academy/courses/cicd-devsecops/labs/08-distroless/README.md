# Lab 08 — Distroless образ < 30 МБ

> Модуль 3 · 1 ч · Sandbox: docker · DSOMM: *Build — Minimized container surface*

## Задача

Превратить «обычный» Dockerfile из ~800 МБ в **< 30 МБ** distroless образ,
без потери функциональности.

## Шаги

1. Стартовый Dockerfile (Go-сервис на ubuntu:22.04 + apt install + go build).
2. Шаг 1 — multi-stage с `golang:alpine` builder + `alpine` runtime → ~50 МБ.
3. Шаг 2 — runtime `gcr.io/distroless/static-debian12:nonroot` → ~15 МБ.
4. Шаг 3 — `FROM scratch` для статичного Go (`CGO_ENABLED=0`) → < 10 МБ.
5. Включить BuildKit `--mount=type=cache` для модулей.
6. Сравнить `docker image inspect` size, `docker scout cves`, `trivy image`.

## Acceptance

- [ ] Образ < 30 МБ.
- [ ] `docker run` стартует без shell, никаких `apk`, никаких `bash`.
- [ ] `USER 65532:65532`, runtime non-root.
- [ ] Trivy показывает 0 HIGH/CRITICAL в финальном образе.

## Rubric: 1 — multi-stage; 2 — distroless; 3 — scratch + non-root; 4 — Trivy gate; 5 — BuildKit SBOM + provenance attestations в registry.
