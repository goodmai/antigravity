# Lab 06 — iOS TestFlight через fastlane

> Модуль 2 · 3 ч · Sandbox: macOS GH runner или self-hosted Mac · DSOMM: *Build — Signed artifacts*

## Задача

Залить beta в TestFlight через `fastlane` из GH Actions без Apple ID + 2FA
(используем ASC API Key).

## Шаги

1. Создать ASC API Key в App Store Connect → Users and Access → Keys.
2. `bundle exec fastlane init` → `Fastfile`, `Appfile`, `Matchfile`.
3. `match init` (Git storage) → запустить `match appstore` локально, чтобы
   первый раз создать сертификаты в encrypted git-репо.
4. Workflow:
   ```yaml
   runs-on: macos-14
   steps:
     - uses: actions/checkout@SHA
     - uses: ruby/setup-ruby@SHA
     - run: bundle exec fastlane ios beta
       env:
         APPSTORE_KEY_ID:     ${{ secrets.APPSTORE_KEY_ID }}
         APPSTORE_ISSUER_ID:  ${{ secrets.APPSTORE_ISSUER_ID }}
         APPSTORE_KEY_P8:     ${{ secrets.APPSTORE_KEY_P8 }}
         MATCH_PASSWORD:      ${{ secrets.MATCH_PASSWORD }}
         MATCH_GIT_BASIC_AUTHORIZATION: ${{ secrets.MATCH_BASIC_AUTH }}
   ```
5. После build — в TestFlight → Internal Group получает уведомление.

## Acceptance

- [ ] Build занимает < 15 минут.
- [ ] Никакого Apple ID + 2FA в CI — только ASC API Key.
- [ ] `match` в readonly mode (не перезаписывает прод-сертификаты).
- [ ] Уведомление о beta-build приходит в Slack/TG.

## Rubric: 1 — ipa собрана; 2 — залита в TestFlight вручную; 3 — CI заливает без интерактива; 4 — Slack/TG notify; 5 — full release flow (`deliver` → App Store Review).
