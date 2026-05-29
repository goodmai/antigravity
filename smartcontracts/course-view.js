// Daskibo course viewer — DRM-gated mirror of antigravity/lessons/index.html.
//
// Boot:
//   1. fetch ./demo/addresses.json → { rpcUrl, chainId, marketplace, courseId,
//      bucket, bucketOwner }. Render the 26-card lesson grid (metadata is
//      public — only the body is encrypted).
//   2. fetch <SP>/<bucket>/_lit/manifest.json → discover which lesson numbers
//      actually live in the bucket (objects = "<N>/README.md.enc"). Cards for
//      missing lessons are dimmed.
//
// Connect:
//   3. eth_requestAccounts + ensureChain(BSC testnet 97).
//   4. read CourseMarketplace.hasCourseAccess(account, courseId). If false →
//      cards stay locked; show CTA to buy on course-demo.html.
//
// Reveal (first card click, lazy):
//   5. personal_sign a proof.
//   6. POST chipotle/lit_action {action:'decrypt', ciphertext, ACC, proof}.
//      Mock re-checks hasCourseAccess against EVM_RPC → returns the master key.
//      Cache the master key for the session (single Chipotle call per session).
//
// Per-card click:
//   7. fetch <SP>/<bucket>/<N>/README.md.enc → JSON envelope.
//   8. AES-GCM decrypt with the cached master key.
//   9. Render the markdown into the reader pane. README.md is markdown and
//      self-contained; the matching index.html.enc has the styled HTML but
//      references ../academy/css/* which isn't in the bucket, so README is
//      the better single-page render target.

import { BrowserProvider, JsonRpcProvider, Contract, getAddress } from 'https://esm.sh/ethers@6.13.4';
import { decryptObject } from './buckets/crypto-envelope.js';

const SP = 'https://gnfd-testnet-sp1.bnbchain.org';
const MP_ABI = [
  'function hasCourseAccess(address,uint256) view returns (bool)',
  'function accessPass() view returns (address)',
];
const AP_ABI = [
  'function wrapNonce(address,uint256) view returns (uint256)',
  'function encryptedKey(uint256) view returns (bytes)',
  'function tokenIdOf(address,uint256) view returns (uint256)',
  'function expiryOf(address,uint256) view returns (uint64)',
  'function setEncryptedKey(uint256,bytes)',
];

// ── canonical lesson catalog (mirrors antigravity/lessons/index.html) ────────
const LESSONS = [
  { id: 1,  title: 'Режимы агента Antigravity',        desc: 'Основы работы и переключения между режимами планирования и выполнения.' },
  { id: 2,  title: 'Обратная связь и Артефакты',       desc: 'Взаимодействие с артефактами и предоставление фидбека в реальном времени.' },
  { id: 3,  title: '@ Mentions и Workflows',           desc: 'Продвинутые техники вызова контекста и автоматизации рутины.' },
  { id: 4,  title: 'Навыки Агента (Agent Skills)',     desc: 'Создание и использование расширяемых возможностей (Skills).' },
  { id: 5,  title: 'Типовые Скиллы',                   desc: 'Обзор стандартного набора инструментов и эффективных промптов.' },
  { id: 6,  title: 'Advanced AI Workflows',            desc: 'Практическая работа по созданию автономных систем разработки.' },
  { id: 7,  title: 'QA Architect',                     desc: 'Проектирование систем автоматического контроля качества.' },
  { id: 8,  title: 'Агентный Режим и Группы Задач',    desc: 'Глубокое погружение во внутреннюю логику планирования (Task Groups).' },
  { id: 9,  title: 'Browser Subagent',                 desc: 'Взаимодействие агента с внешним миром через браузер.' },
  { id: 10, title: 'Model Context Protocol',           desc: 'Использование MCP для подключения внешних данных и инструментов.' },
  { id: 11, title: 'Терминал и Безопасность',          desc: 'Режимы работы с CLI, списки Allow/Deny и защита от инъекций.' },
  { id: 12, title: 'Автотесты с Playwright',           desc: 'Написание E2E тестов и их самовосстановление (Self-Healing).' },
  { id: 13, title: 'Cloud & Firebase',                 desc: 'Управление облачными ресурсами и деплой приложений.' },
  { id: 14, title: 'Docker & Microservices',           desc: 'Оркестрация контейнеров и микросервисная архитектура.' },
  { id: 15, title: 'CI/CD Pipelines',                  desc: 'Генерация пайплайнов для GitHub Actions и Google Cloud Build.' },
  { id: 16, title: 'Mobile: Flutter & React Native',   desc: 'Разработка кроссплатформенных мобильных приложений.' },
  { id: 17, title: 'Modern Web & Next.js',             desc: 'Full-Stack разработка и рефакторинг legacy-кода.' },
  { id: 18, title: 'Рефакторинг кода и AI',            desc: 'Стратегии рефакторинга legacy-кода, TDD и примеры промптов.' },
  { id: 19, title: 'Microservices SDLC',               desc: 'Полный цикл: от TDD и CI/CD до Agent Review и безопасности.' },
  { id: 20, title: 'Промпт-инжиниринг для агентов',    desc: 'CO-STAR, chain-of-thought, few-shot и role prompting в контексте Antigravity Workflows.' },
  { id: 21, title: 'Отладка агентных задач',           desc: 'Диагностика зависших пайплайнов, MCP-ошибок и восстановление через git.' },
  { id: 22, title: 'Кастомные MCP-серверы',            desc: 'Создание собственных MCP-серверов на Python и Node.js, регистрация и отладка.' },
  { id: 23, title: 'Многоагентная оркестрация',        desc: 'Ролевой кастинг, паттерны координации и Grand Unified Workflow для команды агентов.' },
  { id: 24, title: 'Большие кодовые базы',             desc: '.antigravityignore, чанкинг, инкрементальный рефакторинг и управление 2M-токенным окном.' },
  { id: 30, title: 'Web3 — Основы Solidity',           desc: 'Типы данных, функции, видимость, версии pragma, вызов других контрактов.' },
  { id: 31, title: 'Docker Best Practices',            desc: 'Multi-stage builds, безопасность образов и оптимизация размеров.' },
  { id: 32, title: 'Хостинг сайта на BNB Greenfield',  desc: 'Bucket / object / SP, URL-формат, грабля с --contentType, hello-world скрипт на Node.js, нюансы immutable-хранилища.' },
];

const $ = (id) => document.getElementById(id);
const banner = (msg, kind = '') => { const b = $('banner'); b.className = 'banner' + (kind ? ' ' + kind : ''); b.innerHTML = msg; };
const setChip = (id, cls, text) => { const e = $(id); e.className = 'chip' + (cls ? ' ' + cls : ''); e.innerHTML = `<span class="dot"></span> ${text}`; };
const short = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '—');

let cfg = null;             // addresses.json
let manifest = null;        // Greenfield <bucket>/_lit/manifest.json
let manifestKeys = new Set; // available object keys
let account = null;
let masterKey = null;       // cached after first Chipotle release this session

async function boot() {
  try {
    const a = await fetch('./demo/addresses.json', { cache: 'no-store' });
    if (!a.ok) throw new Error('addresses.json HTTP ' + a.status);
    cfg = await a.json();
    if (!cfg.bucket || !cfg.bucketOwner) throw new Error('addresses.json has no bucket/bucketOwner — devnet-writer did not patch it yet.');
    setChip('chip-chain', 'ok', `chain ${cfg.chainId}`);
    setChip('chip-bucket', '', `bucket <code>${cfg.bucket}</code>`);
    setChip('chip-marketplace', '', `marketplace <code>${short(cfg.marketplace)}</code>`);
  } catch (e) {
    banner('Не нашёл <code>./demo/addresses.json</code> с реальным бакетом. Запусти <code>./run_devnet.sh</code> и дождись окончания writer. <br>Детали: ' + e.message, 'err');
    return;
  }

  // Pull the Greenfield manifest so we know which lessons are actually in the
  // bucket and can grey out the rest.
  try {
    const m = await fetch(`${SP}/${cfg.bucket}/_lit/manifest.json`);
    if (!m.ok) throw new Error('SP HTTP ' + m.status);
    manifest = await m.json();
    for (const o of (manifest.objects || [])) manifestKeys.add(o.key);
    banner(`Bucket <code>${cfg.bucket}</code> · ${manifest.objects?.length ?? 0} encrypted objects · gate <code>${manifest.lit?.accessControlConditions?.[0]?.method}</code>. Подключи MetaMask, чтобы расшифровать.`);
  } catch (e) {
    banner('Не смог достучаться до Greenfield SP: ' + e.message, 'err');
    return;
  }

  renderGrid();
}

function renderGrid() {
  const grid = $('grid');
  grid.innerHTML = '';
  for (const L of LESSONS) {
    const inBucket = manifestKeys.has(`${L.id}/README.md.enc`) || manifestKeys.has(`${L.id}/index.html.enc`);
    const div = document.createElement('div');
    div.className = 'card' + (inBucket ? '' : ' denied');
    div.dataset.id = String(L.id);
    div.innerHTML = `
      <div class="num">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
        <span>Урок ${L.id}</span>
      </div>
      <h2>${esc(L.title)}</h2>
      <p>${esc(L.desc)}</p>
      <div class="lock">${inBucket ? '🔒 Зашифровано · клик чтобы открыть' : '— нет в этом бакете'}</div>
    `;
    if (inBucket) div.addEventListener('click', () => openLesson(L));
    grid.appendChild(div);
  }
}

async function ensureChain() {
  if (!window.ethereum || !cfg) return false;
  const eth = window.ethereum;
  const have = await eth.request({ method: 'eth_chainId' });
  if (Number(have) === Number(cfg.chainId)) return true;
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: cfg.chainIdHex }] });
  } catch (err) {
    if (err.code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: cfg.chainIdHex,
          chainName: cfg.chainName || 'BNB Smart Chain Testnet',
          rpcUrls: [cfg.rpcUrl],
          nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
          blockExplorerUrls: cfg.explorer ? [cfg.explorer] : undefined,
        }],
      });
    } else { throw err; }
  }
  const after = await eth.request({ method: 'eth_chainId' });
  return Number(after) === Number(cfg.chainId);
}

async function connect() {
  if (!window.ethereum) { banner('MetaMask не установлен. <a href="https://metamask.io" target="_blank">Скачай MetaMask</a> и обнови страницу.', 'err'); return; }
  $('btn-connect').disabled = true;
  try {
    const accts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    account = getAddress(accts[0]);
    setChip('chip-wallet', 'ok', short(account));
    if (!(await ensureChain())) throw new Error('MetaMask не переключился на нужную сеть');

    // On-chain access check (authoritative — reads via fixed RPC, ignores
    // whatever network MetaMask happens to be on after the switch).
    const read = new JsonRpcProvider(cfg.rpcUrl, cfg.chainId, { staticNetwork: true });
    const mp = new Contract(cfg.marketplace, MP_ABI, read);
    const hasAccess = await mp.hasCourseAccess(account, cfg.courseId || 1);
    if (hasAccess) {
      setChip('chip-access', 'ok', 'access ✓');
      banner(`Доступ есть. ${short(account)} удовлетворяет <code>hasCourseAccess(you, ${cfg.courseId || 1})</code>. Кликни на любой урок — мастер-ключ запросится у Chipotle разово.`, 'ok');
    } else {
      setChip('chip-access', 'err', 'access ✗');
      banner(`У ${short(account)} нет доступа к курсу #${cfg.courseId || 1}. Купи доступ на <a href="./course-demo.html">course-demo.html</a> и обнови страницу.`, 'warn');
      // We still let them try; the Chipotle re-check will give a clear error.
    }
    $('btn-connect').textContent = 'Connected · ' + short(account);
  } catch (e) {
    banner('Не удалось подключить кошелёк: ' + (e?.shortMessage || e?.message || e), 'err');
    $('btn-connect').disabled = false;
  }
}

// Master-key release (scheme P-A, spec/crypto.md).
//
// First call (after purchase): calls wrap_for_buyer → stores address-bound
// ciphertext in the AccessPass NFT via setEncryptedKey (consumes wrapNonce).
// Subsequent calls (same or future sessions): reads ciphertext from NFT,
// decrypts with address proof — no platform API key needed.
//
// Cached for the session so each lesson click after the first costs only
// AES-GCM (no MetaMask prompt, no Chipotle call).
async function ensureMasterKey() {
  if (masterKey) return masterKey;
  if (!account) throw new Error('Connect MetaMask first');
  const lit = manifest.lit;
  if (!lit) throw new Error('manifest.lit missing — bucket was not encrypted');

  const courseId = cfg.courseId || 1;
  const chipotleUrl = (lit.chipotleUrl || 'http://localhost:8000').replace(/\/$/, '');
  const read = new JsonRpcProvider(cfg.rpcUrl, cfg.chainId, { staticNetwork: true });
  const mp   = new Contract(cfg.marketplace, MP_ABI, read);

  // Resolve AccessPass contract (address lives in marketplace)
  const apAddr = await mp.accessPass();
  const ap     = new Contract(apAddr, AP_ABI, read);

  // Look up buyer's token
  const tokenId = await ap.tokenIdOf(account, courseId);

  let buyerCiphertext = null;
  let buyerAcc = null; // address + optional timestamp ACC; captured from wrap or reconstructed

  if (tokenId !== 0n) {
    const stored = await ap.encryptedKey(tokenId);
    if (stored && stored !== '0x') {
      buyerCiphertext = stored; // key already in NFT — skip wrap step
    }
  }

  if (!buyerCiphertext) {
    // ── First login after purchase: wrap vault MK for this address ──────
    if (tokenId === 0n) {
      throw new Error('AccessPass not found — buy the course first');
    }
    const nonce = await ap.wrapNonce(account, courseId);
    if (nonce === 0n) {
      throw new Error('wrapNonce is zero — already wrapped or access expired');
    }

    banner('<span class="spin">⟳</span> Первый вход — создаю персональный ключ доступа (подпись MetaMask)…');
    const wrapMsg = `Daskibo wrap-for-buyer\nCourse: ${courseId}\nWallet: ${account}\nNonce: ${Date.now()}`;
    const wrapSig = await window.ethereum.request({ method: 'personal_sign', params: [wrapMsg, account] });

    const wrapRes = await fetch(`${chipotleUrl}/core/v1/lit_action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // No X-Api-Key — authenticated by buyer's MetaMask signature + on-chain nonce
      body: JSON.stringify({
        js_params: {
          action:            'wrap_for_buyer',
          buyer:             account,
          courseId:          String(courseId),
          nonce:             nonce.toString(),
          vaultCiphertext:   lit.ciphertext,
          accessPassAddress: apAddr,
          signedProof: { message: wrapMsg, signature: wrapSig },
        },
      }),
    });
    const wrapData = await wrapRes.json();
    if (wrapData.has_error) throw new Error('Chipotle wrap failed: ' + (wrapData.logs || wrapData.error));
    buyerCiphertext = wrapData.response?.ciphertext;
    if (!buyerCiphertext) throw new Error('wrap_for_buyer did not return ciphertext');
    buyerAcc = wrapData.response?.acc || null; // includes timestamp condition if expiry > 0

    // Store in NFT — consumes wrapNonce atomically (one MetaMask tx)
    banner('<span class="spin">⟳</span> Записываю ключ в NFT — подтверди транзакцию в MetaMask…');
    const signer  = await (new BrowserProvider(window.ethereum)).getSigner();
    const apWrite = new Contract(apAddr, AP_ABI, signer);
    const tx = await apWrite.setEncryptedKey(tokenId, buyerCiphertext);
    await tx.wait();
    banner('✓ Ключ записан в NFT — расшифровываю контент…', 'ok');
  }

  // ── Decrypt buyer-specific ciphertext with address proof ────────────────
  // Reconstruct ACC if this is a repeat session (ciphertext was already in NFT).
  // ACC = { address == account } AND optionally { block.timestamp <= expiryTs }.
  if (!buyerAcc) {
    const expiry   = await ap.expiryOf(account, courseId);
    const expiryTs = Number(expiry);
    buyerAcc = [{
      contractAddress: '',
      standardContractType: '',
      chain: lit.chain || 'bscTestnet',
      method: '',
      parameters: [':userAddress'],
      returnValueTest: { comparator: '=', value: account },
    }];
    if (expiryTs > 0) {
      buyerAcc.push({ operator: 'and' });
      buyerAcc.push({
        contractAddress: '',
        standardContractType: 'timestamp',
        chain: lit.chain || 'bscTestnet',
        method: 'eth_getBlockByNumber',
        parameters: ['latest'],
        returnValueTest: { comparator: '<=', value: String(expiryTs) },
      });
    }
  }

  banner('<span class="spin">⟳</span> Подписываю proof of ownership…');
  const message = `Daskibo course access\nCourse: ${courseId}\nWallet: ${account}\nNonce: ${Date.now()}`;
  const signature = await window.ethereum.request({ method: 'personal_sign', params: [message, account] });

  const r = await fetch(`${chipotleUrl}/core/v1/lit_action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // No X-Api-Key: ciphertext is address-bound → only this address can decrypt
    body: JSON.stringify({
      js_params: {
        action:                  'decrypt',
        ciphertext:              buyerCiphertext,
        accessControlConditions: buyerAcc,
        chain:                   lit.chain || 'bscTestnet',
        pkpId:                   lit.pkpId,
        userAddress:             account,
        signedProof: { message, signature },
      },
    }),
  });
  const data = await r.json();
  if (data.has_error) throw new Error(data.error || data.logs || 'Chipotle отказал');
  masterKey = data.response?.decrypted;
  if (!masterKey) throw new Error('Chipotle не вернул ключ');
  banner('✓ Мастер-ключ получен — расшифровываю урок…', 'ok');
  return masterKey;
}

async function openLesson(L) {
  if (!account) { banner('Сначала подключи MetaMask наверху.', 'warn'); return; }
  $('catalog').style.display = 'none';
  $('reader').classList.add('on');
  $('reader-title').textContent = `Урок ${L.id} · ${L.title}`;
  $('lesson').innerHTML = '<p><span class="spin">⟳</span> Загружаю и расшифровываю…</p>';

  try {
    await ensureMasterKey();
    const key = `${L.id}/README.md.enc`;
    const envRes = await fetch(`${SP}/${cfg.bucket}/${key}`);
    if (!envRes.ok) throw new Error(`SP ${envRes.status} for ${key}`);
    const envelope = JSON.parse(await envRes.text());
    const { text } = await decryptObject(masterKey, envelope);
    $('lesson').innerHTML = renderMarkdown(text || '');
    banner(`✓ Урок ${L.id} расшифрован.`, 'ok');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    $('lesson').innerHTML = `<p style="color:var(--err)">Ошибка: ${esc(e?.message || String(e))}</p>`;
    banner('Расшифровка не удалась: ' + (e?.message || e), 'err');
  }
}

function backToCatalog() {
  $('reader').classList.remove('on');
  $('catalog').style.display = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── tiny markdown renderer (safe-ish: escape first, then a handful of rules) ─
function renderMarkdown(md) {
  // Escape HTML first.
  const lines = esc(md).split('\n');
  const out = [];
  let inCode = false, codeBuf = [], codeLang = '';
  let inList = false, listKind = null;

  const flushList = () => { if (inList) { out.push(`</${listKind}>`); inList = false; listKind = null; } };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Fenced code block
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      if (inCode) { out.push(`<pre><code>${codeBuf.join('\n')}</code></pre>`); inCode = false; codeBuf = []; }
      else { inCode = true; codeLang = fence[1]; flushList(); }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }

    // Headings
    let m;
    if ((m = /^### (.+)$/.exec(line))) { flushList(); out.push(`<h3>${inline(m[1])}</h3>`); continue; }
    if ((m = /^## (.+)$/.exec(line)))  { flushList(); out.push(`<h2>${inline(m[1])}</h2>`); continue; }
    if ((m = /^# (.+)$/.exec(line)))   { flushList(); out.push(`<h1>${inline(m[1])}</h1>`); continue; }
    if (/^---+$/.test(line.trim()))    { flushList(); out.push('<hr>'); continue; }
    if ((m = /^&gt; (.*)$/.exec(line))) { flushList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }

    // Lists
    if ((m = /^[-*] (.+)$/.exec(line))) {
      if (!inList || listKind !== 'ul') { flushList(); out.push('<ul>'); inList = true; listKind = 'ul'; }
      out.push(`<li>${inline(m[1])}</li>`); continue;
    }
    if ((m = /^\d+\. (.+)$/.exec(line))) {
      if (!inList || listKind !== 'ol') { flushList(); out.push('<ol>'); inList = true; listKind = 'ol'; }
      out.push(`<li>${inline(m[1])}</li>`); continue;
    }

    // Blank line ends paragraphs and lists
    if (line.trim() === '') { flushList(); continue; }

    flushList();
    out.push(`<p>${inline(line)}</p>`);
  }
  if (inCode) out.push(`<pre><code>${codeBuf.join('\n')}</code></pre>`);
  flushList();
  return out.join('\n');
}

function inline(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

$('btn-connect').addEventListener('click', connect);
$('btn-back').addEventListener('click', backToCatalog);
boot();
