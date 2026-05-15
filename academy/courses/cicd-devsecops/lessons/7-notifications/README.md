# Module 7 — Notifications & ChatOps

> Доставка инфы о пайплайнах и метриках в Telegram, Slack, Discord. От webhook
> «вручную» до Alertmanager как маршрутизатора алёртов.

---

## 7.1 · Telegram Bot API: пайплайн → чат

**Канон:** [Telegram Bot API](https://core.telegram.org/bots/api),
[BotFather basics](https://core.telegram.org/bots/features#botfather),
[Telegram MarkdownV2 spec](https://core.telegram.org/bots/api#markdownv2-style).

**Создаём бота:**

1. В Telegram → `@BotFather` → `/newbot`.
2. Получаем `<token>` — храним в **Vault**, а не в `secrets.yml` git'а.
3. `/setdomain`, `/setjoingroups` по необходимости.
4. Добавляем бота в чат, узнаём `chat_id` через `getUpdates` или
   `@RawDataBot`. Чтобы постить в **топик/тред** в супергруппе — нужен
   `message_thread_id`.

### Минимальный send из GH Actions

```yaml
- name: Notify TG
  if: always()                   # шлём и на success, и на failure
  env:
    TG_TOKEN: ${{ secrets.TG_TOKEN }}
    TG_CHAT:  ${{ vars.TG_CHAT_ID }}
  run: |
    STATUS="${{ job.status }}"
    ICON="✅"; [ "$STATUS" != "success" ] && ICON="❌"
    TEXT="${ICON} *${{ github.workflow }}* — \`${{ github.ref_name }}\`%0A"
    TEXT+="commit: [${GITHUB_SHA::7}](${{ github.server_url }}/${{ github.repository }}/commit/${GITHUB_SHA})%0A"
    TEXT+="run: [#${{ github.run_number }}](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }})"
    curl -sS "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
      -d chat_id="${TG_CHAT}" \
      -d parse_mode=MarkdownV2 \
      -d disable_web_page_preview=true \
      --data-urlencode "text=${TEXT}"
```

**Подводные камни Telegram MarkdownV2:**

- Символы `_*[]()~`!#+-=|{}.>` обязаны быть escaped через `\`.
- Поэтому в реальных сборках используют **`apprise`** (Python, унифицирует
  100+ нотификаций) или **`appleboy/telegram-action`**.

### Через `apprise` (один интерфейс на TG/Slack/Discord/Email/SMS)

```bash
pip install apprise
apprise -t "Build OK" -b "ref=$REF sha=$SHA" \
  tgram://${TG_TOKEN}/${TG_CHAT}/        \
  slack://${SLACK_TOKEN_A}/${SLACK_TOKEN_B}/${SLACK_TOKEN_C} \
  discord://${WEBHOOK_ID}/${WEBHOOK_TOKEN}/
```

**Лаба 20** — GH Actions шлёт билд + покрытие + ссылку на артефакт в TG, с
форматированием и attachments.

---

## 7.2 · Slack: incoming webhook vs Slack App

**Канон:** [Slack API docs](https://api.slack.com/),
[Slack Bolt for JS](https://slack.dev/bolt-js/),
[Block Kit Builder](https://app.slack.com/block-kit-builder),
[Slack request signing](https://api.slack.com/authentication/verifying-requests-from-slack).

**Два уровня:**

| | Incoming webhook | Slack App (Bolt) |
|---|---|---|
| Сложность | минимум | выше |
| Можно отправлять | ✓ | ✓ |
| Принимать события | ✗ | ✓ |
| Slash-команды | ✗ | ✓ |
| Interactive components (buttons) | через webhook URL | ✓ нативно |
| Best for | алёрты, простые уведомления | ChatOps |

### Incoming webhook (5 минут)

```bash
curl -X POST $SLACK_WEBHOOK -H 'Content-Type: application/json' -d '{
  "blocks": [
    { "type": "header", "text": { "type": "plain_text", "text": "🚀 Deploy to prod" } },
    { "type": "section", "fields": [
      { "type": "mrkdwn", "text": "*Service*\napp" },
      { "type": "mrkdwn", "text": "*Version*\nv1.2.3" }
    ]},
    { "type": "context", "elements": [
      { "type": "mrkdwn", "text": "<https://github.com/.../actions/runs/123|Run #123> by <@U123>" }
    ]}
  ]
}'
```

### Slack App + slash-команда `/deploy`

`/deploy app v1.2.3` запускает `workflow_dispatch` в GH Actions.

```ts
// Bolt JS
app.command('/deploy', async ({ ack, command, respond }) => {
  await ack();
  const [service, version] = command.text.split(/\s+/);
  if (!isAllowed(command.user_id, service)) {
    return respond(`🚫 ${command.user_id} not allowed to deploy ${service}`);
  }
  await octokit.actions.createWorkflowDispatch({
    owner: 'me', repo: service,
    workflow_id: 'deploy.yml',
    ref: 'main',
    inputs: { version }
  });
  await respond(`🚀 ${service} ${version} deploying — by <@${command.user_id}>`);
});
```

**Безопасность:**

- **Проверяем подпись** `X-Slack-Signature` (HMAC-SHA256 от `v0:<timestamp>:<body>`)
  и timestamp в пределах **5 минут** (защита от replay).
- Allowlist user_id → service.
- Логируем команду в audit log (chatops-audit).

**Лаба 21** — `/deploy` slash command, allowlist, audit-log в InfluxDB.

---

## 7.3 · Discord: webhooks/embeds + Bot

**Канон:** [Discord webhook docs](https://discord.com/developers/docs/resources/webhook),
[Discord embeds](https://discord.com/developers/docs/resources/channel#embed-object),
[discord.js guide](https://discordjs.guide).

### Webhook (минимум)

```bash
curl -H "Content-Type: application/json" -X POST "$DISCORD_WEBHOOK" -d '{
  "username": "CI Bot",
  "embeds": [{
    "title": "Build #123 ✅",
    "color": 3066993,
    "url": "https://...",
    "fields": [
      { "name": "Branch", "value": "main", "inline": true },
      { "name": "Commit", "value": "abc1234", "inline": true },
      { "name": "Tests", "value": "42 ✅ / 0 ❌", "inline": false }
    ],
    "footer": { "text": "github.com/me/app" },
    "timestamp": "2026-05-14T12:00:00.000Z"
  }]
}'
```

**Лимиты Discord embed** (важно знать в CI):

- ≤ 6000 символов на весь embed.
- ≤ 25 fields.
- ≤ 256 символов на field.name, ≤ 1024 на value.
- ≤ 10 embed'ов в одном сообщении.

Если CI генерит огромный лог — обрезаем и кладём ссылкой на артефакт.

### Discord Bot + buttons (interactive)

`discord.js` поддерживает `MessageButton`/`ActionRow`. Можно сделать
кнопку «Acknowledge alert» — нажатие шлёт callback на ваш сервер, который
обновляет alert state в Alertmanager.

---

## 7.4 · Alertmanager как маршрутизатор

**Канон:** [Alertmanager docs](https://prometheus.io/docs/alerting/latest/configuration/),
[Apprise](https://github.com/caronc/apprise),
[Prometheus alerting overview](https://prometheus.io/docs/practices/alerting/).

Вместо «каждый сервис прикручивает свой webhook» — **Alertmanager** как
единая точка маршрутизации. Метрики/правила в Prometheus → Alertmanager →
**route tree** → TG/Slack/Discord/Email/PagerDuty.

```yaml
# alertmanager.yml
global:
  resolve_timeout: 5m

route:
  receiver: default-slack
  group_by: [alertname, cluster, service]
  group_wait: 30s          # ждём 30s других алёртов той же группы
  group_interval: 5m       # как часто шлём следующее уведомление по группе
  repeat_interval: 4h      # как часто повторять unresolved
  routes:
    - match: { severity: critical }
      receiver: pagerduty
      continue: true        # дублируем в Slack
    - match: { severity: critical }
      receiver: tg-critical
    - match_re: { service: payments|orders }
      receiver: slack-team-commerce

inhibit_rules:
  - source_match: { severity: critical }
    target_match: { severity: warning }
    equal: [alertname, instance]

receivers:
  - name: default-slack
    slack_configs:
      - api_url: https://hooks.slack.com/services/T.../B.../X
        channel: '#alerts'
        send_resolved: true
        title: '{{ .Status | toUpper }} - {{ .CommonLabels.alertname }}'
        text: |-
          *{{ .CommonAnnotations.summary }}*
          {{ range .Alerts }}• {{ .Annotations.description }}{{ end }}

  - name: tg-critical
    webhook_configs:
      - url: http://apprise:8000/notify
        send_resolved: true
        # apprise translates JSON → Telegram MarkdownV2

  - name: pagerduty
    pagerduty_configs:
      - service_key: ${PAGERDUTY_KEY}
```

### Один Alertmanager → три канала

Apprise работает как HTTP-микросервис: Alertmanager шлёт JSON → Apprise
форматирует и публикует в TG + Slack + Discord одновременно.

```bash
# apprise --notify-server :8000
# конфиг
tgram://${TG_TOKEN}/${TG_CHAT}/
slack://${T1}/${T2}/${T3}/
discord://${ID}/${TOKEN}/
```

В Alertmanager — один `webhook_configs.url: http://apprise:8000/notify`. **DRY.**

**Лаба 22** — Alertmanager → Apprise → TG + Slack + Discord одновременно,
с inhibit-правилом «critical глушит warning».

---

## Чек-лист модуля

- [ ] Токены ботов (TG/Slack/Discord) — в Vault, не в plain GH secrets.
- [ ] Slack-команды проверяют HMAC-подпись + timestamp < 5 мин.
- [ ] Allowlist user → action для ChatOps.
- [ ] Discord-embed'ы укладываются в лимиты, длинные логи — ссылкой.
- [ ] Alertmanager — единая точка маршрутизации, не каждый сервис со своим webhook.
- [ ] Apprise (или Alertmanager-webhook-helper) шлёт в **все три** канала.
- [ ] `send_resolved: true` — закрытые алёрты тоже отображаются.
- [ ] Inhibit-правила: critical глушит warning по тому же объекту.

## Лабы модуля

- [Lab 20 — TG notify из GH Actions](../../labs/20-telegram/)
- [Lab 21 — Slack `/deploy` ChatOps](../../labs/21-slack-chatops/)
- [Lab 22 — Alertmanager → TG+Slack+Discord](../../labs/22-alertmanager/)
