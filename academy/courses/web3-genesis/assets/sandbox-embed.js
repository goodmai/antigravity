/**
 * Daskibo Academy — Web3 Genesis: sandbox-embed.js
 *
 * Generic mounter for "real-world" sandbox panels used across lessons:
 *
 *   <div class="sandbox" data-embed="remix"
 *        data-source="https://raw.githubusercontent.com/.../Greeter.sol"
 *        data-title="Remix · Greeter.sol"></div>
 *
 *   <div class="sandbox" data-embed="remix-inline"
 *        data-title="Remix · ERC20.sol"
 *        data-filename="ERC20.sol">
 *     <pre>// SPDX-License-Identifier: MIT
 *     contract X {}</pre>
 *   </div>
 *
 *   <div class="sandbox" data-embed="tenderly"
 *        data-network="1"
 *        data-title="Tenderly · Virtual Testnet (Mainnet fork)"></div>
 *
 *   <div class="sandbox" data-embed="rpc-live"
 *        data-network="sepolia"
 *        data-title="Live JSON-RPC · Sepolia"></div>
 *
 *   <div class="sandbox" data-embed="metamask"
 *        data-chain="0xaa36a7"
 *        data-title="MetaMask · добавить Sepolia"></div>
 *
 *   <div class="sandbox" data-embed="anvil"
 *        data-title="Anvil · команда запуска"></div>
 *
 * Все эмбеды строятся в один общий контейнер с заголовком и кнопками.
 * iframe для Remix ленивый (грузится только после клика «Открыть»),
 * чтобы не утяжелять страницу при первом рендере.
 */

const PUBLIC_RPCS = {
  ethereum:  'https://eth.llamarpc.com',
  sepolia:   'https://rpc.sepolia.org',
  arbitrum:  'https://arb1.arbitrum.io/rpc',
  optimism:  'https://mainnet.optimism.io',
  base:      'https://mainnet.base.org',
  polygon:   'https://polygon-rpc.com',
};

const CHAIN_HEX = {
  '1':        'Ethereum mainnet',
  '11155111': 'Sepolia',
  '42161':    'Arbitrum One',
  '10':       'OP Mainnet',
  '8453':     'Base',
  '137':      'Polygon PoS',
};

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (v != null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function frame(title, body, status) {
  const wrap = el('div', { class: 'sandbox-body' });
  wrap.appendChild(body);
  const header = el('div', { class: 'sandbox-header' }, [
    el('span', { class: 'title', text: title }),
    el('span', { class: 'sandbox-status' + (status?.cls ? ' ' + status.cls : ''), text: status?.text || '' }),
  ]);
  return [header, wrap];
}

/* ── Remix embed ───────────────────────────────────────────────────────── */

function buildRemixUrl({ source, code, filename, autoCompile = true, optimize = true }) {
  const params = new URLSearchParams();
  if (autoCompile) params.set('autoCompile', 'true');
  if (optimize)    params.set('optimize',    'true');
  let hash = '';
  if (source) hash = `#url=${encodeURIComponent(source)}`;
  else if (code) {
    // Remix supports base64-encoded source via the `code` URL fragment.
    const b64 = typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(code)))
      : Buffer.from(code, 'utf-8').toString('base64');
    const safe = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    hash = `#code=${safe}`;
    if (filename) hash += `&filename=${encodeURIComponent(filename)}`;
  }
  return `https://remix.ethereum.org/?${params.toString()}${hash}`;
}

function mountRemix(host, opts) {
  const title = opts.title || 'Remix IDE · Solidity sandbox';
  const url = buildRemixUrl(opts);
  const body = el('div');
  const desc = el('p', {
    class: 'embed-desc',
    text: 'In-browser Solidity-компилятор (solc-js) и JavaScript-EVM. iframe ниже даёт IDE целиком: правка → компиляция → деплой → отладка в одном окне. Состояние не сохраняется между перезагрузками — вкладку держите открытой.',
  });
  body.appendChild(desc);

  const actions = el('div', { class: 'sandbox-row embed-actions' }, [
    el('button', { class: 'btn btn-primary', text: 'Открыть Remix во вкладке', type: 'button',
      'data-action': 'open' }),
    el('a', { class: 'btn btn-ghost', text: 'Развернуть в полноэкранном режиме', href: url, target: '_blank', rel: 'noopener' }),
  ]);
  body.appendChild(actions);

  const slot = el('div', { class: 'embed-slot' });
  slot.appendChild(el('p', { class: 'embed-hint',
    text: 'iframe Remix грузится около 5 секунд и весит ~3 МБ. Откройте только когда готовы.' }));
  body.appendChild(slot);

  actions.querySelector('[data-action="open"]').addEventListener('click', () => {
    slot.innerHTML = '';
    const iframe = el('iframe', {
      src: url,
      title: title,
      class: 'embed-iframe embed-iframe-remix',
      loading: 'lazy',
      allow: 'clipboard-read; clipboard-write; cross-origin-isolated',
      sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals',
    });
    slot.appendChild(iframe);
  });

  const [hdr, bodyWrap] = frame(title, body, { text: 'remix.ethereum.org', cls: '' });
  host.appendChild(hdr);
  host.appendChild(bodyWrap);
}

/* ── Tenderly Virtual Testnet quick-launch card ────────────────────────── */

function mountTenderly(host, opts) {
  const title  = opts.title  || 'Tenderly · Virtual Testnet';
  const network = opts.network || '1';
  const chainName = CHAIN_HEX[network] || ('chain ' + network);
  const slug = opts.slug || 'web3-genesis-lab';

  const body = el('div');
  body.appendChild(el('p', { class: 'embed-desc', html:
    `Облачный fork ${chainName} с реальным state и собственным RPC. Создайте бесплатный аккаунт, нажмите «New Virtual Testnet», скопируйте RPC URL — его можно подключать к MetaMask, viem, Foundry. Ниже — прямая ссылка на нужный шаг Dashboard:` }));

  const grid = el('div', { class: 'embed-cards' });
  grid.appendChild(el('a', {
    class: 'embed-card',
    href: 'https://dashboard.tenderly.co/register',
    target: '_blank', rel: 'noopener',
  }, [
    el('h4', { text: '① Регистрация' }),
    el('p', { text: 'Бесплатный план: 1 Virtual Testnet, 50k симуляций / месяц.' }),
  ]));
  grid.appendChild(el('a', {
    class: 'embed-card',
    href: `https://dashboard.tenderly.co/virtual-testnets/new?network=${network}&slug=${encodeURIComponent(slug)}`,
    target: '_blank', rel: 'noopener',
  }, [
    el('h4', { text: '② Создать Virtual Testnet' }),
    el('p', { text: `Шаблон: fork ${chainName}, slug «${slug}». На странице нажмите «Create».` }),
  ]));
  grid.appendChild(el('a', {
    class: 'embed-card',
    href: 'https://docs.tenderly.co/virtual-testnets',
    target: '_blank', rel: 'noopener',
  }, [
    el('h4', { text: '③ Подключить RPC' }),
    el('p', { text: 'Скопируйте «Public RPC URL» и «Admin RPC URL». Передайте в viem / Foundry / MetaMask «Add Network».' }),
  ]));
  grid.appendChild(el('a', {
    class: 'embed-card',
    href: 'https://docs.tenderly.co/simulations-and-forks/simulation-api',
    target: '_blank', rel: 'noopener',
  }, [
    el('h4', { text: '④ Simulation API' }),
    el('p', { text: 'REST API: state overrides, batch-симуляция, trace. Используйте в задачах ниже.' }),
  ]));
  body.appendChild(grid);

  body.appendChild(el('p', { class: 'embed-hint', html:
    'Если у вас уже создан VNet, замените <code>YOUR-SLUG</code> в примерах ниже на свой slug — все команды <code>cast</code>/<code>curl</code> начнут работать против вашего форка.' }));

  const [hdr, bodyWrap] = frame(title, body, { text: 'dashboard.tenderly.co', cls: '' });
  host.appendChild(hdr);
  host.appendChild(bodyWrap);
}

/* ── Live JSON-RPC playground (viem) ───────────────────────────────────── */

const VIEM_CDN = 'https://esm.sh/viem@2';

async function loadViem() {
  return import(/* @vite-ignore */ VIEM_CDN);
}

function mountRpcLive(host, opts) {
  const title = opts.title  || 'Live JSON-RPC playground';
  const netKey = (opts.network || 'sepolia').toLowerCase();
  const rpc = opts.rpc || PUBLIC_RPCS[netKey] || PUBLIC_RPCS.sepolia;

  const body = el('div');
  body.appendChild(el('p', { class: 'embed-desc', html:
    `Реальные запросы к публичной ноде <code>${rpc}</code>. Никаких ключей и подписей — только чтение. Подходит для проверки задач 4.1–4.4 из Lesson 03 на живых данных.` }));

  const row = el('div', { class: 'sandbox-row' });
  const method = el('select');
  for (const m of [
    'eth_blockNumber',
    'eth_chainId',
    'eth_getBalance',
    'eth_getCode',
    'eth_gasPrice',
    'eth_getTransactionByHash',
    'eth_getTransactionReceipt',
    'eth_getBlockByNumber',
  ]) method.appendChild(el('option', { value: m, text: m }));
  const param = el('input', {
    type: 'text',
    placeholder: '0xaddress / 0xtxhash / latest',
    value: 'latest',
  });
  const runBtn = el('button', { class: 'btn btn-primary', text: 'Вызвать', type: 'button' });
  row.appendChild(el('div', { class: 'field' }, [
    el('label', { text: 'method' }), method,
  ]));
  row.appendChild(el('div', { class: 'field' }, [
    el('label', { text: 'param (address / hash / tag)' }), param,
  ]));
  row.appendChild(el('div', { class: 'field' }, [
    el('label', { text: ' ' }), runBtn,
  ]));
  body.appendChild(row);

  const log = el('pre', { class: 'event-log', text: '// нажмите «Вызвать» — отправим JSON-RPC на ' + rpc });
  body.appendChild(log);

  const status = el('span', { text: 'public RPC · read-only' });
  const [hdr, bodyWrap] = frame(title, body, { text: rpc, cls: '' });
  host.appendChild(hdr);
  host.appendChild(bodyWrap);

  runBtn.addEventListener('click', async () => {
    const m = method.value;
    const p = param.value.trim();
    let params;
    if (m === 'eth_blockNumber' || m === 'eth_chainId' || m === 'eth_gasPrice') {
      params = [];
    } else if (m === 'eth_getBalance' || m === 'eth_getCode') {
      params = [p, 'latest'];
    } else if (m === 'eth_getBlockByNumber') {
      params = [encodeBlockTag(p), false];
    } else {
      params = [p];
    }
    log.textContent = '// POST ' + rpc + '\n// ' + JSON.stringify({ method: m, params }) + '\n…';
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params }),
      });
      const json = await res.json();
      log.textContent = JSON.stringify(json, null, 2);
    } catch (err) {
      log.textContent = 'ERROR · ' + (err.message || String(err));
    }
  });
}

/**
 * Block tag helper: passes through named tags (latest/safe/finalized/earliest/pending)
 * and 0x-prefixed hex, converts decimal numbers to 0x-prefixed hex strings.
 */
export function encodeBlockTag(tag) {
  const named = ['latest', 'safe', 'finalized', 'earliest', 'pending'];
  if (!tag) return 'latest';
  const t = String(tag).trim();
  if (named.includes(t.toLowerCase())) return t.toLowerCase();
  if (/^0x[0-9a-fA-F]+$/.test(t)) return t.toLowerCase();
  if (/^\d+$/.test(t)) return '0x' + BigInt(t).toString(16);
  return t;
}

/* ── MetaMask «Add Network» quick-launch ───────────────────────────────── */

const NETWORK_PRESETS = {
  '0x1':        { chainName: 'Ethereum Mainnet', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://eth.llamarpc.com'], blockExplorerUrls: ['https://etherscan.io'] },
  '0xaa36a7':   { chainName: 'Sepolia',           nativeCurrency: { name: 'Sepolia ETH', symbol: 'sepETH', decimals: 18 }, rpcUrls: ['https://rpc.sepolia.org'], blockExplorerUrls: ['https://sepolia.etherscan.io'] },
  '0xa4b1':     { chainName: 'Arbitrum One',      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://arb1.arbitrum.io/rpc'], blockExplorerUrls: ['https://arbiscan.io'] },
  '0xa':        { chainName: 'OP Mainnet',        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.optimism.io'], blockExplorerUrls: ['https://optimistic.etherscan.io'] },
  '0x2105':     { chainName: 'Base',              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'] },
};

function mountMetaMask(host, opts) {
  const title = opts.title || 'MetaMask · добавить сеть';
  const chainId = (opts.chain || '0xaa36a7').toLowerCase();
  const preset = NETWORK_PRESETS[chainId] || NETWORK_PRESETS['0xaa36a7'];

  const body = el('div');
  body.appendChild(el('p', { class: 'embed-desc', html:
    `Стандартный EIP-3085 вызов <code>wallet_addEthereumChain</code>. MetaMask откроет диалог подтверждения. Если кошелёк не установлен — кнопка покажет ссылку на загрузку.` }));

  const pre = el('pre', { class: 'code-block', text:
    'await window.ethereum.request({\n' +
    '  method: "wallet_addEthereumChain",\n' +
    '  params: [' + JSON.stringify({ chainId, ...preset }, null, 2).replace(/\n/g, '\n  ') + ']\n' +
    '});' });
  body.appendChild(pre);

  const status = el('span', { class: 'sandbox-status', text: 'не запущено' });
  const btn = el('button', { class: 'btn btn-primary', type: 'button',
    text: 'Добавить «' + preset.chainName + '» в MetaMask' });
  body.appendChild(btn);

  btn.addEventListener('click', async () => {
    if (!window.ethereum) {
      status.textContent = 'MetaMask не найден — https://metamask.io/download/';
      status.className = 'sandbox-status err';
      return;
    }
    try {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{ chainId, ...preset }],
      });
      status.textContent = 'сеть добавлена ✓';
      status.className = 'sandbox-status ok';
    } catch (err) {
      status.textContent = 'отменено · ' + (err.message || err.code);
      status.className = 'sandbox-status err';
    }
  });

  const [hdr, bodyWrap] = frame(title, body, { text: preset.chainName, cls: '' });
  // заменяем дефолтный статус-span на наш живой
  hdr.querySelector('.sandbox-status').replaceWith(status);
  host.appendChild(hdr);
  host.appendChild(bodyWrap);
}

/* ── Anvil quick-launch card ───────────────────────────────────────────── */

function mountAnvil(host, opts) {
  const title = opts.title  || 'Anvil · локальный EVM на 8545';
  const forkUrl = opts.fork || '';
  const body = el('div');
  body.appendChild(el('p', { class: 'embed-desc', html:
    'Anvil — реальный EVM-node на Rust, ставится одной командой <code>foundryup</code>. Ниже — копи-пасте под ваш сценарий:' }));
  const cmds = [
    { label: 'Установка Foundry (один раз)', code: 'curl -L https://foundry.paradigm.xyz | bash && foundryup' },
    { label: 'Запустить Anvil (10 фейковых аккаунтов, по 10000 ETH)', code: 'anvil' },
    { label: 'Запустить как fork mainnet (mainnet state на localhost:8545)', code: 'anvil --fork-url ' + (forkUrl || 'https://eth.llamarpc.com') },
    { label: 'Проверка из второго терминала', code: 'cast chain-id --rpc-url http://127.0.0.1:8545\ncast block-number --rpc-url http://127.0.0.1:8545' },
  ];
  for (const c of cmds) {
    body.appendChild(el('p', { class: 'embed-cmd-label', text: c.label }));
    body.appendChild(el('pre', { class: 'code-block', text: c.code }));
  }
  body.appendChild(el('p', { class: 'embed-hint', html:
    'В CI используйте Docker-образ <code>ghcr.io/foundry-rs/foundry:latest</code>. В StackBlitz / Codespaces — <code>npx @foundry-rs/easy-foundryup</code>.' }));

  const [hdr, bodyWrap] = frame(title, body, { text: 'localhost:8545', cls: '' });
  host.appendChild(hdr);
  host.appendChild(bodyWrap);
}

/* ── Dispatcher ────────────────────────────────────────────────────────── */

function parseInline(host) {
  // Если внутри <div class="sandbox"> лежит <pre>, забираем оттуда исходник.
  const pre = host.querySelector('pre');
  return pre ? pre.textContent.trim() : '';
}

function mount(host) {
  const kind = host.dataset.embed;
  const opts = {
    title:    host.dataset.title,
    source:   host.dataset.source,
    code:     host.dataset.code,
    filename: host.dataset.filename,
    network:  host.dataset.network,
    rpc:      host.dataset.rpc,
    chain:    host.dataset.chain,
    slug:     host.dataset.slug,
    fork:     host.dataset.fork,
  };
  if (kind === 'remix-inline' && !opts.code) opts.code = parseInline(host);
  host.innerHTML = '';
  switch (kind) {
    case 'remix':
    case 'remix-inline':
      mountRemix(host, opts); break;
    case 'tenderly':
      mountTenderly(host, opts); break;
    case 'rpc-live':
      mountRpcLive(host, opts); break;
    case 'metamask':
      mountMetaMask(host, opts); break;
    case 'anvil':
      mountAnvil(host, opts); break;
    default:
      host.appendChild(el('p', { class: 'embed-hint', text: 'Unknown embed type: ' + kind }));
  }
}

export function mountAll(root = document) {
  for (const host of root.querySelectorAll('.sandbox[data-embed]')) mount(host);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mountAll());
  } else {
    mountAll();
  }
}

// Exports for tests
export { buildRemixUrl, PUBLIC_RPCS, NETWORK_PRESETS };
