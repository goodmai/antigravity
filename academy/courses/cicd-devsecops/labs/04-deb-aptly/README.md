# Lab 04 — `.deb` + локальный aptly-репозиторий

> Модуль 2 · 2 ч · Sandbox: docker-compose · DSOMM: *Build — Pinned dependencies, Signed packages*

## Задача

Собрать `.deb` своей CLI через `dpkg-buildpackage`, подписать GPG, опубликовать
в локальный aptly-репо, установить на чистом Ubuntu-контейнере.

## Шаги

1. **Подготовить `debian/`** дерево (control, changelog, rules, copyright, compat).
2. **GPG-ключ** локально (`gpg --quick-gen-key`).
3. **Сборка**:
   ```bash
   dpkg-buildpackage -us -uc -b
   lintian *.deb            # must be clean
   debsign -k <KEY-ID> *.changes
   ```
4. **aptly-репо** в docker-compose:
   ```yaml
   services:
     aptly:
       image: instrumentisto/aptly
       volumes: [aptly:/aptly, ./gpg:/root/.gnupg]
       ports: ["8080:8080"]
   ```
5. **Публикация**:
   ```bash
   docker compose exec aptly aptly repo create -distribution=jammy my-repo
   docker compose exec aptly aptly repo add my-repo /aptly/incoming/*.deb
   docker compose exec aptly aptly publish repo -gpg-key=<KEY-ID> my-repo
   docker compose exec aptly aptly api serve
   ```
6. **Установка из репо** в свежем `ubuntu:22.04` контейнере:
   ```bash
   echo "deb [signed-by=/etc/apt/keyrings/aptly.gpg] http://host.docker.internal:8080 jammy main" \
     > /etc/apt/sources.list.d/aptly.list
   apt-key export <KEY-ID> > /etc/apt/keyrings/aptly.gpg   # ⚠ не делать так в проде
   apt update && apt install -y mycli
   ```

## Acceptance

- [ ] `lintian` зелёный.
- [ ] `apt-get install` из aptly работает.
- [ ] **`apt-key`** нигде не используется — только `signed-by=`.
- [ ] Сборка автоматизирована в GH Actions.

## Rubric: 1 — собрался .deb; 2 — lintian green; 3 — подписан GPG; 4 — установка из aptly; 5 — CI собирает + публикует + smoke install в контейнере.
