# Lab 05 — Публичный Homebrew tap

> Модуль 2 · 1 ч · Sandbox: macOS / Linuxbrew · DSOMM: *Build — Reproducible builds*

## Задача

Создать публичный tap `homebrew-mytap` с формулой, которая обновляется
автоматически при каждом GitHub Release.

## Шаги

1. Создать GH-репо `<owner>/homebrew-mytap`.
2. Добавить `Formula/mycli.rb` (см. lesson 2.3).
3. В основном репо CLI:
   ```yaml
   # .github/workflows/release.yml
   - uses: dawidd6/action-homebrew-bump-formula@SHA
     with:
       token: ${{ secrets.PUSH_TOKEN }}
       tap: <owner>/homebrew-mytap
       formula: mycli
   ```
4. Локально: `brew tap <owner>/mytap && brew install mycli`.
5. Бонус: pre-built bottle через GoReleaser:
   ```yaml
   # .goreleaser.yaml
   brews:
     - name: mycli
       repository: { owner: <owner>, name: homebrew-mytap }
   ```

## Acceptance

- [ ] `brew install` работает на macOS Intel **и** Apple Silicon.
- [ ] Релиз `v1.2.3` → tap обновлён автоматически в той же job.
- [ ] `brew test mycli` зелёный.

## Rubric: 1 — формула есть; 2 — install работает; 3 — авто-bump из CI; 4 — bottles для x86_64 + arm64; 5 — GoReleaser генерит всё одной командой.
