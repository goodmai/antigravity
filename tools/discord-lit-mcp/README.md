# discord-lit-mcp

Minimal, **read-only** MCP server that reads the **Lit Protocol Discord server**
(guild `896185694857343026`) so the [`lit` skill](../../skills/lit/SKILL.md) can
look up **faucets** and **current technical docs** shared there. Default channel:
`#💻-dev-support` (forum, `1100139039241277470`).

> Note: `896185694857343026` is the **guild (server) id**, not a channel — the
> server resolves channels under it. Override with `LIT_DISCORD_GUILD_ID` /
> `LIT_DISCORD_CHANNEL_ID`.

Four tools, all read-only (no message sending, no writes):

| Tool | Purpose |
| --- | --- |
| `list_channels()` | Text/announcement/forum channels of the guild |
| `read_messages(channel?, limit?, before?, after?)` | Recent messages; for forum channels, recent threads |
| `read_thread(thread, limit?)` | Messages of one thread / forum post |
| `search_messages(query, channel?, max?)` | Keyword scan (e.g. `faucet`, `naga`, `yellowstone`); handles forum threads |

It calls the Discord REST API directly — **no third-party Discord library**, so
there is nowhere for a dependency to steal your token. Read `server.mjs`: it is
~120 lines.

## ⚠️ Terms-of-Service warning

This server authenticates with a **Discord user token (self-bot)** because that
is the only way to read a channel on a server you do not administer "от своего
имени". **Automating a personal user token violates the Discord Terms of
Service and can get your account banned.** You accepted this trade-off; use at
your own risk. (A ToS-compliant alternative is a *bot* token + inviting the bot
to a server you control.)

## Setup

```bash
cd tools/discord-lit-mcp
npm install
```

Provide your token via the environment (never commit it — `.env*` is gitignored):

```bash
export DISCORD_USER_TOKEN='your-discord-user-token'
# optional: read a different channel
export LIT_DISCORD_CHANNEL_ID=896185694857343026
```

The server is registered in the repo-root [`.mcp.json`](../../.mcp.json) and
launches automatically in Claude Code once `DISCORD_USER_TOKEN` is exported in
the environment Claude Code runs in.

### Getting the user token

Discord does not expose user tokens in the UI by design. Retrieving it (DevTools
→ Network → `Authorization` request header) is itself against Discord ToS. This
README does not walk through it; that is on you.

## Use from the lit skill

> Find the current Yellowstone faucet link posted in the Lit Discord.

→ `search_messages(query: "faucet")` then open the newest matching link.
Cross-check against the canonical web sources listed in the lit skill
(`chronicle-yellowstone-faucet.getlit.dev`, `developer.litprotocol.com`).
