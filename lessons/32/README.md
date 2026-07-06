# Урок 32: Хостинг сайта на BNB Greenfield

> Пошаговый гайд по размещению статического сайта в децентрализованном хранилище BNB Greenfield. Создадим бакет, зальём `index.html` + CSS + картинку, разберём URL-формат, поймаем главную граблю с `--contentType`, и в конце соберём hello-world-скрипт на Node.js, который делает то же самое программно.
>
> Источник: [BNB Greenfield Hosting Tutorial](https://docs.bnbchain.org/bnb-greenfield/for-developers/tutorials/hosting-websites-overview/).

---

## Введение

Обычный веб-хостинг сводится к «арендуй сервер, отдай ему файлы, направь домен». Это работает, но имеет известные минусы: единая точка отказа, сервер может пропасть, провайдер может cделать takedown, а ты — заложник одной компании.

**BNB Greenfield** — децентрализованное хранилище в экосистеме BNB Chain. Файлы лежат не на одной машине, а реплицируются между независимыми **Storage Providers** (SP); метаданные (кто владелец, какие права, какой объект существует) живут в собственной Cosmos-чейне Greenfield (`greenfield_1017-1` mainnet, `greenfield_5600-1` testnet). Любой сайт, который состоит из статических файлов (HTML/CSS/JS/изображения), можно полностью разместить там — без серверов, без хостеров.

Этот урок — практический. Пройдём весь путь: от `gnfd-cmd init` до открытия `https://<sp>/view/<bucket>/index.html` в браузере.

---

## 1. Архитектура: bucket, object, SP, URL

Прежде чем заливать что-то, нужно понять четыре сущности.

### Bucket (бакет)

Контейнер для файлов, чем-то напоминает S3-бакет: глобально уникальное имя в нижнем регистре (`[a-z0-9-]`), 3–63 символа. Принадлежит одному адресу (owner), имеет **primary SP** — основной провайдер хранения. На testnet SP-адреса публикуются в реестре, например:

| SP | EVM-адрес | View-эндпойнт |
|----|-----------|---------------|
| SP1 | `0x231099e40E1f98879C4126ef35D82FF006F24fF2` | `https://gnfd-testnet-sp1.bnbchain.org` |
| SP2 | `0xCe1A0D9DDE7Ed3a4D9Eb9eB73FbBC2AC93A30A88` | `https://gnfd-testnet-sp-2.bnbchain.org` |

Бакет создаётся on-chain транзакцией `MsgCreateBucket` — за неё платится комиссия в BNB.

### Object (объект)

Файл внутри бакета. Имя — это **полный путь** относительно бакета, можно с «подпапками» (`assets/img/plato.jpg` — никаких настоящих папок в Greenfield нет, это просто часть имени). У объекта обязательно есть:

- `contentType` (MIME) — критично для сайта, иначе браузер не отрендерит,
- `visibility` (`public-read` / `private` / `inherit`) — кто может скачать,
- `payload size` — размер для оплаты хранения.

### Storage Provider

SP — нода, которая принимает и отдаёт байты, выставляя HTTP-эндпойнт. Один primary SP + secondary-копии (erasure coding 4+2): даже если 2 из 6 SP'ов исчезнут, объект восстанавливается.

### Greenfield URL

```
gnfd://<bucket_name>/<object_name>?[parameter]*
```

Это «нативный» формат для on-chain ссылок. Для браузера используется HTTP-вариант через view-эндпойнт SP:

```
https://<sp-host>/view/<bucket_name>/<object_name>
```

`view` — стримит файл inline с правильным content-type (если он указан). Для скачивания вместо просмотра — `/download/...`.

---

## 2. Подготовка

### 2.1 Установка gnfd-cmd (CLI)

```bash
# из исходников (требует Go 1.20+)
git clone https://github.com/bnb-chain/greenfield-cmd
cd greenfield-cmd
make build
sudo install build/gnfd-cmd /usr/local/bin/
gnfd-cmd version    # → проверка
```

Или скачать [release-бинарник](https://github.com/bnb-chain/greenfield-cmd/releases) под свою ОС.

### 2.2 Конфиг и ключ

```bash
# Создаём keystore — он зашифрован паролем, ключ в plaintext нигде не лежит.
gnfd-cmd keystore generate

# Инициализация: указываем testnet endpoints
gnfd-cmd config set rpcAddr "https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org:443"
gnfd-cmd config set chainId  "greenfield_5600-1"
```

### 2.3 Пополнение баланса

Greenfield использует **BNB** для газа и **отдельный балансовый счёт «payment account»** для оплаты хранения и трафика. Тестнет-faucet даёт оба:

- [https://gnfd-testnet-faucet.bnbchain.org](https://gnfd-testnet-faucet.bnbchain.org) — заплати tBNB на твой адрес.
- Затем `gnfd-cmd payment deposit --amount 0.05` — перевести часть в payment-аккаунт.

Проверка:

```bash
gnfd-cmd bank balance        # газовый счёт
gnfd-cmd payment ls          # хранилище / стриминговая оплата
```

---

## 3. Создаём bucket

Имя бакета должно быть **глобально уникальным**. Используй префикс/timestamp.

```bash
gnfd-cmd bucket create \
  --visibility public-read \
  --primarySP 0x231099e40E1f98879C4126ef35D82FF006F24fF2 \
  gnfd://my-hello-world-$(date +%s)
```

Ответ:

```
make_bucket: my-hello-world-1716902400
transaction hash: E083FB2647D0A53640B63AD1DB8EFA0E1C5CC05454C0774E3DB2A4822E73D423
```

Проверь в [testnet.greenfieldscan.com](https://testnet.greenfieldscan.com) — там будет тx `MsgCreateBucket` и новый bucket-объект.

> **Цена.** Создание бакета — несколько центов tBNB газа. Хранение оплачивается отдельно через streaming-payment в зависимости от суммарного размера объектов.

---

## 4. Готовим hello-world сайт

Минимум три файла. Создаём папку `site/`:

`site/index.html`:

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <title>Hello, Greenfield!</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <h1>Hello, Greenfield 🌱</h1>
    <p>Этот сайт лежит в децентрализованном хранилище BNB Greenfield.</p>
    <img src="logo.png" alt="logo" />
  </body>
</html>
```

`site/styles.css`:

```css
body{font-family:system-ui,sans-serif;background:#0b0d12;color:#e2e8f0;
     max-width:640px;margin:4em auto;padding:0 1em;line-height:1.6}
h1{background:linear-gradient(to right,#38bdf8,#818cf8);-webkit-background-clip:text;
   background-clip:text;color:transparent}
img{max-width:200px;margin-top:1em}
```

`site/logo.png` — любая картинка-логотип.

> Используем **относительные пути** (`href="styles.css"`, `src="logo.png"`). Это работает, потому что все файлы — внутри одного бакета, и браузер резолвит относительный путь от текущего URL, который указывает в этот же бакет.

---

## 5. Загружаем файлы — ВАЖНО про `--contentType`

Главная ошибка из туториала BNB: если не указать MIME-тип, объект отдаётся как `application/octet-stream`, и браузер либо **скачивает файл вместо рендера**, либо **отказывается применять CSS** из-за strict MIME checking.

> **Greenfield — immutable storage.** Чтобы «обновить» объект, его нужно удалить и залить заново. Поэтому лучше сразу указать правильный `--contentType`.

```bash
BUCKET="gnfd://my-hello-world-1716902400"

# HTML — text/html
gnfd-cmd object put \
  --visibility public-read \
  --contentType text/html \
  ./site/index.html "$BUCKET/index.html"

# CSS — text/css
gnfd-cmd object put \
  --visibility public-read \
  --contentType text/css \
  ./site/styles.css "$BUCKET/styles.css"

# Картинка — image/png
gnfd-cmd object put \
  --visibility public-read \
  --contentType image/png \
  ./site/logo.png "$BUCKET/logo.png"
```

Каждая команда вернёт что-то вроде:

```
object index.html created on chain
transaction hash: 20921F3C1DBE3F911217CE82BDC9DC2A745AF61912651A5F9D80F10989A8FC20
sealing...
upload index.html to gnfd://my-hello-world-1716902400/index.html
```

«Sealing» — это асинхронная фаза, когда SP'ы реплицируют объект и подписывают onchain-подтверждение. Занимает ~30–90 секунд. Пока не запечатан — `view`-эндпойнт может вернуть 404.

### Проверяем

Открой в браузере:

```
https://gnfd-testnet-sp1.bnbchain.org/view/my-hello-world-1716902400/index.html
```

(подставь свой bucket name). Должна показаться страница, CSS должен примениться, картинка — отрисоваться. Если нет — проверь content-type через `gnfd-cmd object stat`:

```bash
gnfd-cmd object stat "$BUCKET/styles.css"
# должен быть Content-Type: text/css
```

Если MIME неправильный — удалить и залить заново:

```bash
gnfd-cmd object delete "$BUCKET/styles.css"
# ждём 1-2 блока, потом put с правильным --contentType
```

---

## 6. Hello-World скрипт на Node.js (программно, без CLI)

Тот же самый результат, но через JS SDK. Удобно для CI, авто-деплоя и встраивания в build-пайплайны.

`upload-site.mjs`:

```js
import { Client } from '@bnb-chain/greenfield-js-sdk';
import { readFileSync } from 'node:fs';
import { resolve, extname, basename } from 'node:path';

// ── 0. Конфиг ────────────────────────────────────────────────────────────
const RPC      = 'https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org';
const CHAIN_ID = 5600;
const SP       = 'https://gnfd-testnet-sp1.bnbchain.org';
const PRIMARY_SP = '0x231099e40E1f98879C4126ef35D82FF006F24fF2';

const PK   = process.env.GREENFIELD_TESTNET_PRIVATE_KEY;
const ADDR = process.env.GREENFIELD_TESTNET_ADDRESS;
if (!PK || !ADDR) throw new Error('Set GREENFIELD_TESTNET_PRIVATE_KEY/_ADDRESS');

const BUCKET = `hello-${Date.now().toString(36)}`;
const SITE_DIR = './site';
const FILES = [
  { path: 'index.html', mime: 'text/html' },
  { path: 'styles.css', mime: 'text/css' },
  { path: 'logo.png',   mime: 'image/png' },
];

// ── 1. Клиент ────────────────────────────────────────────────────────────
const client = Client.create(RPC, String(CHAIN_ID));

// ── 2. Создаём bucket ────────────────────────────────────────────────────
console.log(`→ Creating bucket ${BUCKET}…`);
const createTx = await client.bucket.createBucket({
  bucketName: BUCKET,
  creator: ADDR,
  visibility: 'VISIBILITY_TYPE_PUBLIC_READ',
  chargedReadQuota: '0',
  primarySpAddress: PRIMARY_SP,
  paymentAddress: ADDR,
});
const sim = await createTx.simulate({ denom: 'BNB' });
const broadcast = await createTx.broadcast({
  denom: 'BNB',
  gasLimit: Number(sim.gasLimit),
  gasPrice: sim.gasPrice,
  payer: ADDR,
  granter: '',
  privateKey: PK,
});
if (broadcast.code !== 0) throw new Error(`createBucket failed: ${broadcast.rawLog}`);
console.log(`  ✓ bucket tx ${broadcast.transactionHash}`);

// ── 3. Заливаем файлы (sp.delegateUploadObject — SP создаёт объект on-chain) ─
for (const f of FILES) {
  const body = readFileSync(resolve(SITE_DIR, f.path));
  console.log(`→ Uploading ${f.path} (${f.mime}, ${body.length} B)…`);
  await client.object.delegateUploadObject({
    bucketName: BUCKET,
    objectName: f.path,
    body: new File([body], f.path, { type: f.mime }),
    delegatedOpts: { visibility: 'VISIBILITY_TYPE_PUBLIC_READ' },
                                                                                   endpoint: SP,
  }, { type: 'ECDSA', privateKey: PK });
  console.log(`  ✓ ${f.path}`);
}

console.log(`\nSite is live (after ~60s sealing):`);
console.log(`  ${SP}/view/${BUCKET}/index.html`);
```

Запуск:

```bash
export GREENFIELD_TESTNET_PRIVATE_KEY=0x...   # funded tBNB
export GREENFIELD_TESTNET_ADDRESS=0x...
npm install @bnb-chain/greenfield-js-sdk
node upload-site.mjs
```

Через минуту открой выведенный URL — сайт должен заработать. Готово.

> В этом репозитории есть готовая инфраструктура: [`smartcontracts/greenfield-testnet/write-testnet.mjs`](../../smartcontracts/greenfield-testnet/write-testnet.mjs) делает то же самое для целого курса (не одного hello-сайта), а измерение размера и газа — [`measure-course-testnet.mjs`](../../smartcontracts/greenfield-testnet/measure-course-testnet.mjs).

---

## 7. Производительность и нюансы

### Кэш SP
SP кэширует HTTP-ответы. Если ты сразу после `put` тыкаешь в `view`-URL и получаешь 404 — это либо ещё идёт sealing, либо кэш. Подожди 1–2 минуты, перезагрузи без кэша (Ctrl+Shift+R).

### CORS
Greenfield SP отдаёт `Access-Control-Allow-Origin: *` для `view`-эндпойнта. То есть твой сайт на Greenfield может делать `fetch` к другим бакетам без проблем. Однако сами SP-эндпойнты для **загрузки/админки** — не публичные, требуют off-chain auth.

### Доменное имя
Чтобы получить нормальный URL вместо `https://gnfd-testnet-sp1.bnbchain.org/view/.../index.html`:

- На testnet: пока никак (только через прокси).
- На mainnet: используй [Space Domain](https://docs.bnbchain.org/bnb-greenfield/for-users/space/) — ENS-подобный сервис, который маппит `mysite.bnb` на bucket.

### Стоимость хранения
Greenfield использует **streaming-payment**: размер бакета × тариф SP × время хранения. Маленький hello-world сайт (десятки КБ) расходует около $0.0001/месяц на mainnet. Тестнет — бесплатно (faucet).

### Атомарность
В отличие от Git/IPFS, в Greenfield **нет понятия «коммит сразу пачки файлов»**. Каждый `put` — отдельная транзакция. Для атомарных деплоев одной правки сайта используй практику **версионированных бакетов**: `mysite-v3` → залить всё → переключить домен/ссылку на новый бакет. Старый бакет можно удалить или оставить для отката.

---

## 8. Что почитать дальше

- Официальный [Greenfield Whitepaper](https://github.com/bnb-chain/greenfield-whitepaper) — на 30 страниц про модель оплаты и erasure coding.
- [@bnb-chain/greenfield-js-sdk](https://github.com/bnb-chain/greenfield-js-sdk) — полный JS SDK; смотри `examples/` в репо.
- В этом курсе следующий шаг — **Урок 33** (TBD): динамические сайты с auth через wallet + смарт-контрактом за плэйноло (как `course-demo.html` в нашем репозитории, только публично).

---

## Краткая выжимка

1. Bucket → один контейнер с уникальным именем, привязан к primary SP.
2. Object → файл с обязательным `--contentType` — иначе CSS/HTML не работают.
3. Greenfield URL: `gnfd://bucket/object`, для браузера → `https://<sp>/view/<bucket>/<object>`.
4. Storage — **immutable**: чтобы обновить файл, удалить и залить заново.
5. CLI `gnfd-cmd` — для ручной работы; `@bnb-chain/greenfield-js-sdk` — для автоматизации.
6. Sealing занимает ~30–90 секунд после `put` — пока он не закончен, `view` может возвращать 404.

---

> ⚡ Anti-Gravity Academy · Web3 track · урок 32
