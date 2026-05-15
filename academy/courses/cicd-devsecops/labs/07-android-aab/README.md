# Lab 07 — Android AAB → Play Console internal track

> Модуль 2 · 2 ч · Sandbox: docker (no real Play required для unit-теста flow) · DSOMM: *Build — Signed artifacts*

## Задача

Собрать подписанный AAB и опубликовать в Play Console internal track через
[Gradle Play Publisher](https://github.com/Triple-T/gradle-play-publisher).

## Шаги

1. **Создать upload keystore**:
   ```bash
   keytool -genkey -v -keystore upload.jks -keyalg RSA -keysize 4096 \
           -validity 10000 -alias upload
   base64 upload.jks > upload.jks.b64
   ```
2. **Play Console** → Setup → API access → создать service account, дать роль
   Release Manager, скачать JSON.
3. **`build.gradle.kts`** (см. lesson 2.5).
4. **CI**:
   ```yaml
   - name: Decode keystore + sa
     run: |
       echo "${{ secrets.UPLOAD_KEYSTORE_B64 }}" | base64 -d > app/upload.jks
       echo "${{ secrets.PLAY_SA_JSON }}"        > app/play-sa.json
   - run: ./gradlew bundleRelease publishReleaseBundle
   ```
5. В Play Console увидеть build в `Internal testing`.

## Acceptance

- [ ] AAB подписан upload-key.
- [ ] Play App Signing включён (Google пере-подписывает финальный APK).
- [ ] Service account JSON хранится в Vault или GH Environment (`prod`).
- [ ] Загрузка идёт **только** с тага `v*` (защищаем prod).

## Rubric: 1 — AAB подписан; 2 — внутренний трек; 3 — release notes авто-генерируется из changelog; 4 — screengrab прикрепляет скриншоты; 5 — staged rollout 5% → 20% → 100% через CI.
