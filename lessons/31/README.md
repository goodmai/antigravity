# Урок 31: Docker Best Practices — Rootless, Docker Hub, GHCR

> Безопасная контейнеризация: запуск без root, публикация образов в Docker Hub и GitHub Container Registry, мультиархитектурные сборки и автоматизация через CI/CD.

---

## Почему rootless Docker

По умолчанию Docker-демон работает с правами root. Если злоумышленник вырывается из контейнера, он получает root на хосте. Rootless-режим запускает демон внутри пространства имён пользователя — компрометация контейнера не даёт доступ к системе.

```bash
# Включить rootless-режим (одноразово)
dockerd-rootless-setuptool.sh install

# Экспорт переменных в ~/.bashrc
export DOCKER_HOST=unix://${XDG_RUNTIME_DIR}/docker.sock
export PATH=/usr/bin:$PATH

# Проверить
docker info | grep -i rootless   # должно быть: rootless: true
```

### Ограничения rootless

| Функция | Обычный Docker | Rootless |
|:---|:---:|:---:|
| Publish порт < 1024 | ✅ | ❌ (нужен `sysctl net.ipv4.ip_unprivileged_port_start=80`) |
| overlay2 storage driver | ✅ | ✅ (ядро ≥ 5.11) |
| Docker-in-Docker | ✅ | ⚠️ |
| GPU passthrough | ✅ | ✅ (через `--device`) |

---

## Доставка образов в Docker Hub

### 1. Настройка

```bash
# Создайте аккаунт на hub.docker.com
# Создайте Access Token: Account Settings → Security → New Access Token

docker login -u <username>
# Введите Access Token (не пароль!)
```

### 2. Правильный тег

```bash
# Формат: <username>/<repo>:<tag>
docker build -t myapp:1.0.0 .
docker tag myapp:1.0.0 myusername/myapp:1.0.0
docker tag myapp:1.0.0 myusername/myapp:latest

docker push myusername/myapp:1.0.0
docker push myusername/myapp:latest
```

### 3. Multi-stage + минимальный образ

```dockerfile
# Stage 1: сборка
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server .

# Stage 2: рантайм — только бинарник
FROM gcr.io/distroless/static-debian12
COPY --from=builder /app/server /server
USER nonroot:nonroot
ENTRYPOINT ["/server"]
```

Distroless-образ не содержит shell — снижает attack surface до минимума.

---

## GitHub Container Registry (GHCR)

GHCR хранит образы рядом с кодом на GitHub. Поддерживает гранулярные права (`read`, `write`, `admin`) на уровне пакета.

### Аутентификация

```bash
# Personal Access Token (classic) с правом write:packages
echo $GITHUB_TOKEN | docker login ghcr.io -u <github-username> --password-stdin
```

### Тег и пуш

```bash
# Формат: ghcr.io/<owner>/<repo>:<tag>
docker build -t ghcr.io/myorg/myapp:1.0.0 .
docker push ghcr.io/myorg/myapp:1.0.0
```

### Видимость пакета

По умолчанию пакет наследует видимость репозитория. Сделать публичным:
`GitHub → Packages → <package> → Package Settings → Change visibility`

---

## Мультиархитектурные образы (buildx)

Один тег для `linux/amd64` и `linux/arm64` — образ работает и на x86-сервере, и на Apple M-чипах, и на Raspberry Pi.

```bash
# Создать builder с поддержкой эмуляции
docker buildx create --name multiarch --driver docker-container --use
docker buildx inspect --bootstrap

# Собрать и сразу запушить для двух платформ
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ghcr.io/myorg/myapp:1.0.0 \
  --push \
  .
```

Проверка:
```bash
docker buildx imagetools inspect ghcr.io/myorg/myapp:1.0.0
```

---

## Сканирование образов (Trivy / Docker Scout)

```bash
# Trivy (open source)
trivy image ghcr.io/myorg/myapp:1.0.0

# Docker Scout (встроен в Docker Desktop)
docker scout cves ghcr.io/myorg/myapp:1.0.0
docker scout recommendations ghcr.io/myorg/myapp:1.0.0
```

Политика: **не пушить образы с критическими (CRITICAL) CVE** в prod-реестр. Закрепите это в CI.

---

## CI/CD: GitHub Actions — сборка и пуш в GHCR

```yaml
# .github/workflows/docker.yml
name: Docker Build & Push

on:
  push:
    branches: [main]
    tags: ["v*"]

permissions:
  contents: read
  packages: write   # нужно для GHCR

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}   # токен генерируется автоматически

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=semver,pattern={{version}}
            type=sha,prefix=sha-

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Scan with Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ghcr.io/${{ github.repository }}:${{ steps.meta.outputs.version }}
          format: sarif
          output: trivy-results.sarif
          severity: CRITICAL,HIGH

      - name: Upload Trivy results to Security tab
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: trivy-results.sarif
```

---

## Чеклист лучших практик

| # | Практика | Инструмент |
|:---|:---|:---|
| 1 | Запускайте демон без root | `dockerd-rootless` |
| 2 | Используйте non-root USER в Dockerfile | `USER 1001` |
| 3 | Не храните секреты в слоях образа | `.dockerignore`, BuildKit secrets |
| 4 | Минимальный базовый образ | `distroless`, `alpine`, `scratch` |
| 5 | Multi-stage builds | Dockerfile stage |
| 6 | Тегируйте версией + sha | `semver`, `sha-*` |
| 7 | Сканируйте CVE перед пушем | Trivy, Docker Scout |
| 8 | Мультиарх для amd64 + arm64 | `docker buildx` |
| 9 | Кэш слоёв в CI | `cache-from/to: type=gha` |
| 10 | Read-only filesystem в рантайме | `docker run --read-only` |

---

## BuildKit secrets — секреты без утечки в слои

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./

# Секрет доступен только во время RUN, не попадает в образ
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm ci

COPY . .
CMD ["node", "server.js"]
```

```bash
docker build --secret id=npmrc,src=$HOME/.npmrc -t myapp .
```

---

## Типичные ошибки

- **`latest` как единственный тег** — невозможно откатиться к предыдущей версии.
- **Секреты через `ARG`/`ENV`** — видны в `docker history` и слоях образа.
- **Пуш без сканирования** — уязвимый образ идёт в прод.
- **Один образ под все платформы (`amd64` только)** — не работает на arm64/Raspberry Pi.
- **Нет `.dockerignore`** — `node_modules`, `.git`, `.env` попадают в контекст сборки.

---

## Definition of Done

- [ ] Включён rootless-режим, `docker info` показывает `rootless: true`.
- [ ] Образ собран через multi-stage и запушен в Docker Hub с тегом `v1.0.0`.
- [ ] Тот же образ запушен в GHCR через GitHub Actions.
- [ ] Multiarch-манифест содержит `linux/amd64` и `linux/arm64`.
- [ ] Trivy не нашёл CRITICAL CVE в образе.
- [ ] Dockerfile использует `USER nonroot` и не хранит секреты в слоях.

---

## Практические задания

> Артефакты — в `artifacts/lesson-31/`.

### Задание 1 — Rootless setup
Включите rootless Docker. Убедитесь, что `docker run hello-world` работает без `sudo`. Зафиксируйте вывод `docker info | grep -A5 Security`.

### Задание 2 — Multi-stage Dockerfile
Напишите multi-stage Dockerfile для любого вашего приложения (Node.js или Python). Финальный образ должен быть на `distroless` или `alpine`. Измерьте разницу в размере (`docker images`).

### Задание 3 — Docker Hub push
Запушите образ в Docker Hub с тегами `v1.0.0` и `latest`. Убедитесь, что он доступен публично.

### Задание 4 — GHCR через GitHub Actions
Создайте workflow `docker.yml`, который при пуше в `main` собирает образ и пушит в GHCR. Проверьте, что пакет появился в разделе Packages репозитория.

### Задание 5 — Multiarch
Добавьте в workflow поддержку `linux/amd64,linux/arm64`. Проверьте через `imagetools inspect`.

### Задание 6 — Сканирование
Добавьте шаг Trivy в pipeline. Настройте загрузку SARIF-отчёта в Security → Code scanning.

### Задание 7 — BuildKit secrets
Перепишите одну зависимость, которая требует приватного токена (npm, pip), через `--mount=type=secret`. Убедитесь, что `docker history` не содержит токена.

---

## Что дальше

Урок 14 (Docker & Microservices) закрывает оркестрацию сервисов.  
Урок 15 (CI/CD Pipelines) — полный пайплайн GitHub Actions с keyless-аутентификацией в GCP.
