# Lab 20 — GH Actions → Telegram

> Модуль 7 · 1 ч · Sandbox: local · DSOMM: *Information Gathering — Alert delivery*

## Задача

Отправить уведомление в Telegram (с MarkdownV2 escape, coverage, ссылкой на
run) при каждом push в `main` и при каждом failure.

## Шаги

1. Создать бота через `@BotFather`, получить `TG_TOKEN`, узнать `TG_CHAT_ID`
   через `getUpdates`.
2. Хранить токен в **Vault** (а в GH Secret — короткоживущий proxy), для лабы
   допустимо положить прямо в `secrets.TG_TOKEN`.
3. Workflow:
   ```yaml
   - if: always()
     uses: appleboy/telegram-action@SHA
     with:
       to:      ${{ vars.TG_CHAT_ID }}
       token:   ${{ secrets.TG_TOKEN }}
       format:  markdown
       message: |
         *${{ job.status }}* — `${{ github.workflow }}`
         coverage: ${{ env.COV }}%
         [run](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }})
   ```
4. Кросс-чек: попробовать запушить ветку с `_*_*_` в имени — увидеть, что
   escape MarkdownV2 работает.

## Acceptance

- [ ] Уведомление приходит на success и failure.
- [ ] Coverage и ссылка на run валидные.
- [ ] `if: always()` запускает шаг даже при ошибке job.

## Rubric: 1 — basic message; 2 — формат и ссылки; 3 — coverage; 4 — пишет в **топик** (thread); 5 — apprise → mass-broadcast в TG+Slack+Discord одной командой.
