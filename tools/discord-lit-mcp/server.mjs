#!/usr/bin/env node
/**
 * lit-discord — minimal, auditable MCP server for READING the Lit Protocol
 * Discord server (guild 896185694857343026) to find faucets and current
 * technical docs. Default channel: #💻-dev-support (forum, 1100139039241277470).
 *
 * ⚠️ Authenticates with a Discord USER token (self-bot). This is how the user
 *    explicitly asked to read the server "от своего имени". Automating a
 *    personal user token VIOLATES the Discord Terms of Service and can get the
 *    account banned. The token is read from DISCORD_USER_TOKEN only — never
 *    written to disk or committed.
 *
 * READ-ONLY surface (no send / no writes):
 *   • list_channels()                                  — text/announcement/forum channels of the guild
 *   • read_messages(channel?, limit?, before?, after?) — messages; for forum channels, recent threads
 *   • read_thread(thread, limit?)                      — messages of one thread/post
 *   • search_messages(query, channel?, max?)           — keyword scan (handles forum threads)
 *
 * Talks straight to the Discord REST API — no third-party Discord library, so
 * there is nowhere for a dependency to exfiltrate the token. User tokens use a
 * bare `Authorization: <token>` header (no "Bot " prefix).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const TOKEN = process.env.DISCORD_USER_TOKEN;
const GUILD_ID = process.env.LIT_DISCORD_GUILD_ID || '896185694857343026';
const DEFAULT_CHANNEL = process.env.LIT_DISCORD_CHANNEL_ID || '1100139039241277470';
const API = 'https://discord.com/api/v10';
const HEADERS = { Authorization: TOKEN, 'User-Agent': 'lit-discord-mcp/1.0 (read-only)' };

if (!TOKEN) {
  console.error('[lit-discord] DISCORD_USER_TOKEN is not set — the server cannot read Discord.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET with timeout, 429 backoff, and transient-network retry (Cloudflare flaps). */
async function api(path, tries = 4) {
  if (!TOKEN) throw new Error('DISCORD_USER_TOKEN not set');
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(API + path, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
      if (res.status === 429) {
        const j = await res.json().catch(() => ({}));
        await sleep((j.retry_after || 1) * 1000 + 200);
        continue;
      }
      if (res.status === 401) throw new Error('401 Unauthorized — token invalid/expired');
      if (res.status === 403) throw new Error('403 Forbidden — this account cannot read that channel');
      if (res.status === 404) throw new Error('404 Not Found — wrong id, or not a channel you can see');
      if (!res.ok) throw new Error(`Discord API ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(1000 * (i + 1));
    }
  }
}

const compact = (m) => ({
  id: m.id,
  at: m.timestamp,
  author: m.author?.username ?? '?',
  content: m.content || '',
  embeds: (m.embeds || []).map((e) => [e.title, e.description, e.url].filter(Boolean).join(' — ')).filter(Boolean),
  links: [...new Set((m.content || '').match(/https?:\/\/\S+/g) || [])].concat(
    (m.embeds || []).map((e) => e.url).filter(Boolean),
  ),
});

const renderMsgs = (msgs) =>
  !msgs.length
    ? 'No messages.'
    : msgs
        .map((m) => {
          const lines = [`[${m.at}] ${m.author}: ${m.content}`];
          for (const e of m.embeds) lines.push(`    ↳ ${e}`);
          if (m.links.length) lines.push(`    → ${m.links.slice(0, 4).join('  ')}`);
          return lines.join('\n');
        })
        .join('\n');

/** Forum (type 15): collect recent threads = active (guild-wide, filtered) + archived public. */
async function forumThreads(channelId, limit = 25) {
  const active = await api(`/guilds/${GUILD_ID}/threads/active`).catch(() => ({ threads: [] }));
  let threads = (active.threads || []).filter((t) => t.parent_id === channelId);
  const archived = await api(`/channels/${channelId}/threads/archived/public?limit=${limit}`).catch(() => ({ threads: [] }));
  threads = threads.concat(archived.threads || []);
  threads.sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1));
  return threads.slice(0, limit);
}

/** First (starter) message of a thread. */
async function threadStarter(threadId) {
  const msgs = await api(`/channels/${threadId}/messages?limit=4`).catch(() => []);
  return msgs.length ? compact(msgs[msgs.length - 1]) : null;
}

const server = new McpServer({ name: 'lit-discord', version: '2.0.0' });

server.tool(
  'list_channels',
  'List the readable text/announcement/forum channels of the Lit Protocol Discord server.',
  {},
  async () => {
    const cs = await api(`/guilds/${GUILD_ID}/channels`);
    const kinds = { 0: 'text', 5: 'announce', 15: 'forum' };
    const rows = cs
      .filter((c) => c.type in kinds)
      .map((c) => `#${c.name}  (id ${c.id}, ${kinds[c.type]})`)
      .join('\n');
    return { content: [{ type: 'text', text: rows || 'No readable channels.' }] };
  },
);

server.tool(
  'read_messages',
  'Read recent messages from a channel (default: #dev-support). For forum channels, returns recent threads with a snippet — use read_thread to open one.',
  {
    channel: z.string().optional().describe(`Channel id (default ${DEFAULT_CHANNEL})`),
    limit: z.number().int().min(1).max(100).optional().describe('Messages/threads to return (default 25)'),
    before: z.string().optional(),
    after: z.string().optional(),
  },
  async ({ channel = DEFAULT_CHANNEL, limit = 25, before, after }) => {
    const meta = await api(`/channels/${channel}`);
    if (meta.type === 15) {
      const threads = await forumThreads(channel, limit);
      const lines = [];
      for (const t of threads) {
        const s = await threadStarter(t.id);
        lines.push(`• [${(s?.at || '').slice(0, 10)}] "${t.name}" (thread ${t.id})`);
        if (s) lines.push(`    ${s.content.slice(0, 200).replace(/\n/g, ' ')}`);
        if (s?.links?.length) lines.push(`    → ${s.links.slice(0, 3).join('  ')}`);
      }
      return { content: [{ type: 'text', text: `Forum #${meta.name}: ${threads.length} recent threads\n\n` + lines.join('\n') }] };
    }
    const qs = new URLSearchParams({ limit: String(limit) });
    if (before) qs.set('before', before);
    if (after) qs.set('after', after);
    const page = await api(`/channels/${channel}/messages?${qs}`);
    return { content: [{ type: 'text', text: renderMsgs(page.map(compact)) }] };
  },
);

server.tool(
  'read_thread',
  'Read messages of a single thread / forum post by its id.',
  {
    thread: z.string().describe('Thread (or forum post) id'),
    limit: z.number().int().min(1).max(100).optional().describe('Messages (default 50)'),
  },
  async ({ thread, limit = 50 }) => {
    const page = await api(`/channels/${thread}/messages?limit=${limit}`);
    return { content: [{ type: 'text', text: renderMsgs(page.reverse().map(compact)) }] };
  },
);

server.tool(
  'search_messages',
  'Keyword-search a channel (e.g. "faucet", "naga", "yellowstone", "rpc", "docs"). Forum channels are searched across thread titles + starter messages.',
  {
    query: z.string().describe('Case-insensitive substring'),
    channel: z.string().optional().describe(`Channel id (default ${DEFAULT_CHANNEL})`),
    max: z.number().int().min(50).max(1000).optional().describe('Max messages/threads to scan (default 300)'),
  },
  async ({ query, channel = DEFAULT_CHANNEL, max = 300 }) => {
    const needle = query.toLowerCase();
    const meta = await api(`/channels/${channel}`);
    const hits = [];

    if (meta.type === 15) {
      const threads = await forumThreads(channel, Math.min(max / 4, 100));
      for (const t of threads) {
        const s = await threadStarter(t.id);
        const hay = (t.name + ' ' + (s?.content || '') + ' ' + (s?.embeds || []).join(' ')).toLowerCase();
        if (hay.includes(needle)) hits.push({ at: s?.at, author: s?.author ?? '?', content: `"${t.name}" — ${s?.content || ''}`, embeds: [], links: s?.links || [] });
      }
      return { content: [{ type: 'text', text: `Forum #${meta.name}: scanned ${threads.length} threads, ${hits.length} match "${query}":\n\n` + renderMsgs(hits) }] };
    }

    let before, scanned = 0;
    while (scanned < max) {
      const page = await api(`/channels/${channel}/messages?limit=100${before ? `&before=${before}` : ''}`);
      if (!page.length) break;
      scanned += page.length;
      before = page[page.length - 1].id;
      for (const raw of page) {
        const m = compact(raw);
        if ((m.content + ' ' + m.embeds.join(' ')).toLowerCase().includes(needle)) hits.push(m);
      }
      if (page.length < 100) break;
    }
    return { content: [{ type: 'text', text: `#${meta.name}: scanned ${scanned}, ${hits.length} match "${query}":\n\n` + renderMsgs(hits) }] };
  },
);

await server.connect(new StdioServerTransport());
console.error(`[lit-discord] ready — guild ${GUILD_ID}, default channel ${DEFAULT_CHANNEL} (read-only)`);
