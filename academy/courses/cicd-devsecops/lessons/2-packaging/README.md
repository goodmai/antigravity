# Module 2 — Multi-platform Packaging

> Собрать пакет правильно — половина DevOps. Здесь делаем `.deb`, Homebrew tap,
> iOS TestFlight через fastlane, Android AAB → Play Console, и кросс-платформенные
> релизы через GoReleaser/JReleaser.

---

## 2.1 · Ubuntu/Debian: `.deb`, PPA, репозитории

**Канон:** [Debian New Maintainers' Guide](https://www.debian.org/doc/manuals/maint-guide/),
[debhelper docs](https://manpages.debian.org/bookworm/debhelper/debhelper.7.en.html),
[Ubuntu Packaging Guide](https://packaging.ubuntu.com),
[reprepro](https://manpages.debian.org/bookworm/reprepro/reprepro.1.en.html),
[aptly](https://www.aptly.info).

### Anatomy of `.deb`

```
mypkg_1.2.3-1_amd64.deb
├── debian-binary       # версия формата
├── control.tar.gz      # control, postinst, prerm, conffiles
└── data.tar.xz         # сам контент пакета (/usr/bin/..., /etc/..., /lib/systemd/...)
```

### Минимальный `debian/` дерева пакета

```
debian/
├── changelog       # ОБЯЗАТЕЛЬНО, dch -i для новых записей
├── control         # имя, версия, deps, описание
├── rules           # makefile, "dh $@" для большинства случаев
├── compat          # уровень debhelper (13 для bookworm)
├── copyright       # лицензия
└── source/format   # "3.0 (native)" или "3.0 (quilt)"
```

`debian/control`:

```
Source: mycli
Section: utils
Priority: optional
Maintainer: You <you@example.com>
Build-Depends: debhelper-compat (= 13), golang-go
Standards-Version: 4.6.2

Package: mycli
Architecture: any
Depends: ${shlibs:Depends}, ${misc:Depends}
Description: My CLI tool
 Подробное описание.
```

Сборка:

```bash
dpkg-buildpackage -us -uc -b           # -b: только binary, без подписи
lintian *.deb                          # обязательная проверка стиля
debsign -k <gpg-key-id> *.changes      # подпись релиза
```

### PPA (Launchpad) vs свой aptly-репо

| | PPA | aptly self-host |
|---|---|---|
| Кто хостит | Launchpad (Canonical) | вы |
| Подпись | автоматически | свой GPG-key |
| Кэш CDN | да | через CloudFront/Bunny/Caddy |
| Цена | бесплатно | $$ за S3+CDN |
| Контроль | низкий | полный |

### aptly + S3 + CloudFront

```bash
aptly repo create -distribution=jammy -component=main myrepo
aptly repo add myrepo build/*.deb
aptly publish repo -gpg-key="..." myrepo s3:mybucket:
```

```
# /etc/apt/sources.list.d/myrepo.list (у клиента)
deb [signed-by=/etc/apt/keyrings/myrepo.gpg] https://apt.example.com jammy main
```

**Безопасно:** `signed-by=` (а **не** `apt-key add`, который deprecated и
небезопасен — overrides всех ключей).

**Лаба 04** — собрать `.deb` в CI, опубликовать в локальный aptly, установить
из своего источника.

---

## 2.2 · Snap & Flatpak

**Канон:** [snapcraft.io/docs](https://snapcraft.io/docs/snapcraft-yaml-reference),
[Flatpak builder reference](https://docs.flatpak.org/en/latest/flatpak-builder-command-reference.html).

**Snap** — Canonical, confinement через AppArmor, авто-обновления, transactional
rollback (через btrfs-снэпы на /). Каналы: `stable`/`candidate`/`beta`/`edge`.

```yaml
# snapcraft.yaml
name: mycli
base: core22
version: '1.2.3'
summary: My CLI
description: |
  ...
grade: stable
confinement: strict
parts:
  mycli:
    plugin: go
    source: .
apps:
  mycli:
    command: bin/mycli
    plugs: [home, network]
```

```bash
snapcraft
snapcraft upload mycli_1.2.3_amd64.snap --release=stable
```

**Flatpak** — нейтральный, sandbox через bubblewrap + portals, runtime-based
(KDE, GNOME, Freedesktop).

---

## 2.3 · Homebrew: formula, tap, bottle

**Канон:** [Homebrew Formula Cookbook](https://docs.brew.sh/Formula-Cookbook),
[How to Create and Maintain a Tap](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap),
[brew test-bot](https://github.com/Homebrew/homebrew-test-bot).

**Tap** — это GitHub-репозиторий формул, `homebrew-<name>`.

```ruby
# Formula/mycli.rb (в репо homebrew-mytap)
class Mycli < Formula
  desc "My CLI"
  homepage "https://example.com"
  url "https://github.com/me/mycli/archive/refs/tags/v1.2.3.tar.gz"
  sha256 "deadbeef..."
  license "MIT"

  depends_on "go" => :build

  def install
    system "go", "build", "-o", bin/"mycli", "./cmd/mycli"
  end

  test do
    assert_match "1.2.3", shell_output("#{bin}/mycli --version")
  end
end
```

Установка пользователем:

```bash
brew tap me/mytap
brew install mycli
```

**Bottle** — pre-built бинарник, чтобы пользователь не ждал компиляции:

```bash
brew install --build-bottle mycli
brew bottle mycli                       # генерит bottle.tar.gz и DSL-патч
```

**CI-флоу:** GH Actions matrix (`macos-13`, `macos-14`) собирает bottle на
Intel и Apple Silicon, push в tap-репо, обновляет SHA в формуле.

**Лаба 05** — публичный tap для своей CLI с автогенерацией формулы из релиза.

---

## 2.4 · iOS: Xcode + fastlane

**Канон:** [fastlane docs](https://docs.fastlane.tools),
[App Store Connect API key](https://developer.apple.com/documentation/appstoreconnectapi),
[match (encrypted certs)](https://docs.fastlane.tools/actions/match/).

iOS-сборка обязана:

- быть на **macOS** (Xcode), значит self-hosted mac runner или GH macOS-runner;
- быть подписана корректным сертификатом + provisioning profile;
- идти в **TestFlight** через App Store Connect API.

### `match`: сертификаты в git под шифрованием

```ruby
# Matchfile
git_url("git@github.com:me/certs.git")
storage_mode("git")
type("appstore")
app_identifier(["com.example.myapp"])
username("dev@example.com")
```

```bash
fastlane match appstore --readonly
```

В CI — readonly, ключ дешифрования из секретов (см. Module 5).

### Fastfile: lane для TestFlight

```ruby
default_platform(:ios)

platform :ios do
  desc "Build & upload to TestFlight"
  lane :beta do
    setup_ci                                          # подготовка keychain в CI
    app_store_connect_api_key(
      key_id: ENV["APPSTORE_KEY_ID"],
      issuer_id: ENV["APPSTORE_ISSUER_ID"],
      key_content: ENV["APPSTORE_KEY_P8"]
    )
    match(type: "appstore", readonly: true)
    increment_build_number(xcodeproj: "MyApp.xcodeproj")
    build_app(scheme: "MyApp", export_method: "app-store")
    upload_to_testflight(skip_waiting_for_build_processing: true)
  end
end
```

### GH Actions workflow для iOS

```yaml
name: ios-beta
on: { workflow_dispatch:, push: { tags: [ 'v*' ] } }

jobs:
  beta:
    runs-on: macos-14            # arm64
    steps:
      - uses: actions/checkout@SHA
      - uses: ruby/setup-ruby@SHA
        with: { ruby-version: '3.3', bundler-cache: true }
      - run: bundle exec fastlane ios beta
        env:
          APPSTORE_KEY_ID:     ${{ secrets.APPSTORE_KEY_ID }}
          APPSTORE_ISSUER_ID:  ${{ secrets.APPSTORE_ISSUER_ID }}
          APPSTORE_KEY_P8:     ${{ secrets.APPSTORE_KEY_P8 }}
          MATCH_PASSWORD:      ${{ secrets.MATCH_PASSWORD }}
```

**Best practices:**

- ASC API Key (`.p8`) **вместо** Apple ID + 2FA (последний не работает в CI).
- `MATCH_PASSWORD` — приличная парольная фраза (≥ 20 символов).
- `setup_ci` создаёт временный keychain, после job — удаляется.

**Лаба 06** — TestFlight через self-hosted mac runner.

---

## 2.5 · Android: AAB, signing, Play Store

**Канон:** [Android App Bundle](https://developer.android.com/guide/app-bundle),
[Gradle Play Publisher](https://github.com/Triple-T/gradle-play-publisher),
[Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756).

С августа 2021 Google Play принимает только **AAB** (не APK). Подпись — двухслойная:

1. **Upload key** — у вас. Им подписываете AAB перед загрузкой.
2. **App signing key** — у Google (Play App Signing). Им подписывается финальный
   APK, который доезжает до пользователя.

Это даёт **rotate upload key** без потери пользователей — мощная история.

### `build.gradle.kts` (App Module)

```kotlin
android {
    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("UPLOAD_KEYSTORE_PATH"))
            storePassword = System.getenv("UPLOAD_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("UPLOAD_KEY_ALIAS")
            keyPassword = System.getenv("UPLOAD_KEY_PASSWORD")
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = true
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

play {
    serviceAccountCredentials.set(file("$rootDir/play-sa.json"))
    track.set("internal")
    defaultToAppBundles.set(true)
}
```

### CI

```yaml
- name: Decode keystore
  run: |
    echo "${{ secrets.UPLOAD_KEYSTORE_B64 }}" | base64 -d > /tmp/upload.jks
- name: Build & publish AAB
  env:
    UPLOAD_KEYSTORE_PATH:     /tmp/upload.jks
    UPLOAD_KEYSTORE_PASSWORD: ${{ secrets.UPLOAD_KEYSTORE_PASSWORD }}
    UPLOAD_KEY_ALIAS:         upload
    UPLOAD_KEY_PASSWORD:      ${{ secrets.UPLOAD_KEY_PASSWORD }}
  run: ./gradlew publishReleaseBundle
```

**Service account JSON** — лежит в Vault (см. Module 5), достаётся в job через
External Secrets Operator или прямой Vault Agent Sidecar.

**Лаба 07** — AAB → internal track + сразу скриншоты через fastlane `screengrab`.

---

## 2.6 · Кросс-платформенные артефакты

**Канон:** [GoReleaser](https://goreleaser.com/intro/),
[JReleaser](https://jreleaser.org), [electron-builder](https://www.electron.build),
[Tauri](https://v2.tauri.app/distribute/).

### GoReleaser (Go-CLI на все платформы за один файл)

```yaml
# .goreleaser.yaml
version: 2

builds:
  - main: ./cmd/mycli
    binary: mycli
    env: [ "CGO_ENABLED=0" ]
    goos: [linux, darwin, windows]
    goarch: [amd64, arm64]

archives:
  - format: tar.gz
    format_overrides: [{ goos: windows, format: zip }]

nfpms:                   # .deb / .rpm / .apk
  - id: packages
    package_name: mycli
    formats: [deb, rpm, apk]
    maintainer: You <you@example.com>

brews:                   # автогенерация Homebrew formula
  - name: mycli
    repository: { owner: me, name: homebrew-mytap }
    homepage: https://example.com
    license: MIT

snapcrafts:
  - publish: true
    summary: My CLI
    description: ...

dockers:
  - image_templates:
      - "ghcr.io/me/mycli:{{ .Version }}-amd64"
    use: buildx
    build_flag_templates: ["--platform=linux/amd64"]

signs:
  - cmd: cosign
    args: ["sign-blob", "--yes", "--output-signature=${signature}", "${artifact}"]
    artifacts: all
```

Запуск в CI: `goreleaser release --clean` — собирает архивы, deb/rpm, Homebrew
формулу, Snap, Docker-образ, подписывает cosign'ом.

### JReleaser (JVM-стек: Maven Central, Homebrew, .deb, Docker)

Аналог для Java/Kotlin: `jreleaser full-release`. Удобно публикует в
Maven Central через [Sonatype OSSRH](https://central.sonatype.org/publish/publish-portal-ossrh-staging-api/).

---

## Чек-лист модуля

- [ ] `.deb` собран в CI, лёг в aptly, проверен `lintian`.
- [ ] Подписан **GPG-key**, клиент использует `signed-by=`, не `apt-key`.
- [ ] Homebrew tap имеет автогенерируемую формулу при релизе.
- [ ] iOS-сборка идёт через `match` + ASC API key, **без** Apple ID + 2FA.
- [ ] Android-сборка использует AAB + Play App Signing, upload-key rotatable.
- [ ] Кросс-платформа — один `.goreleaser.yaml` / `jreleaser.yml`, никакого
      ручного дублирования.

## Лабы модуля

- [Lab 04 — `.deb` + aptly](../../labs/04-deb-aptly/)
- [Lab 05 — Homebrew tap](../../labs/05-brew-tap/)
- [Lab 06 — iOS TestFlight](../../labs/06-ios-testflight/)
- [Lab 07 — Android AAB → Play](../../labs/07-android-aab/)
