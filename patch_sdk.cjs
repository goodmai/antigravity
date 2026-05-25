const fs = require('fs');

const replacement = `const createEIP712 = (types, chainId, message) => {
    // Ground truth: the Go node reconstructs the EIP-712 typed data in
    // greenfield-cosmos-sdk x/auth/tx/eip712.go (GetMsgTypes + WrapTxToTypedData).
    // We mirror it EXACTLY. Verified by running cmd/print712 against v1.10.7.
    //
    // Node facts that earlier patches got wrong:
    //   * addresses stay CHECKSUMMED (do NOT lowercase)
    //   * msg.type stays the proto type URL "/greenfield.storage.MsgCreateBucket"
    //     (do NOT rewrite to the Amino name "storage/CreateBucket")
    //   * primary_sp_approval has NO 'sig' field when the sig is empty — the
    //     node drops empty byte-slices, so the type must not declare it
    //   * chain_id is the numeric EIP-155 id ("9000"), type uint256 — NOT the
    //     Cosmos chain-id string "greenfield_9000-1"
    //   * the node sorts every struct's fields alphabetically by name
    const parseChainId = (id) => {
        if (typeof id === 'number') return id;
        if (typeof id === 'string') {
            const match = id.match(/_(\\d+)-/);
            if (match) return Number(match[1]);
            const num = Number(id);
            if (!isNaN(num)) return num;
        }
        return 9000;
    };

    const numericChainId = parseChainId(chainId);
    const normMsg = message;

    // EIP-712 domain.verifyingContract depends on the Altai upgrade
    // (greenfield-cosmos-sdk x/auth/tx/eip712.go getSignBytes):
    //   * pre-Altai (our local greenfield_9000-1, which never schedules Altai):
    //     the literal string "greenfield"
    //   * post-Altai (testnet/mainnet): gnfdVerifyingContract
    //     "0x71e835aff094655dEF897fbc85534186DbeaB75d" = keccak256("greenfield")[12:]
    // The local chain runs the OLD scheme, so it must sign over "greenfield".
    const isLocalChain = numericChainId === 9000;
    const verifyingContract = isLocalChain
        ? 'greenfield'
        : '0x71e835aff094655dEF897fbc85534186DbeaB75d';

    if (types) {
        // EIP712Domain: exact field set + types, alphabetically sorted.
        types.EIP712Domain = [
            { name: 'chainId', type: 'uint256' },
            { name: 'name', type: 'string' },
            { name: 'salt', type: 'string' },
            { name: 'verifyingContract', type: 'string' },
            { name: 'version', type: 'string' },
        ];

        // The node omits the empty 'sig' byte-slice from the approval struct,
        // so the declared type must not include it (eip712.go traverseFields
        // skips empty omitEmpty collections).
        for (const key of Object.keys(types)) {
            if (Array.isArray(types[key])) {
                types[key] = types[key].filter((f) => f.name !== 'sig');
            }
        }

        // chain_id is uint256 (SignDocEip712.ChainId = typedChainID.Uint64()).
        if (types.Tx) {
            const chainIdField = types.Tx.find((f) => f.name === 'chain_id');
            if (chainIdField) chainIdField.type = 'uint256';
        }

        // Mirror WrapTxToTypedData: sort each struct's fields by name.
        for (const key of Object.keys(types)) {
            if (Array.isArray(types[key])) {
                types[key].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
            }
        }
    }

    // message.chain_id = numeric EIP-155 id rendered as the jsonpb uint64
    // string "9000". eth-sig-util encodes "9000" and 9000 identically.
    normMsg.chain_id = String(numericChainId);

    const payload = {
        types,
        primaryType: 'Tx',
        domain: {
            name: 'Greenfield Tx',
            version: '1.0.0',
            chainId: numericChainId,
            verifyingContract,
            salt: '0',
        },
        message: normMsg,
    };

    console.log("SDK GENERATED EIP-712 PAYLOAD:", JSON.stringify(payload, null, 2));

    return payload;
};`;

// ── SP object-storage patches ──────────────────────────────────────────────
// The local gnfd-sp gateway is reached cross-container by a docker hostname
// ("greenfield-local") on a non-standard port (903x), and we drive it via
// PATH-STYLE URLs (the gateway registers a PathPrefix("/{bucket}") subrouter).
// Three upstream functions assume a dotted public domain + virtual-hosted
// buckets + port-less Host, so we rewrite them.

// verifyUrl: accept docker service names and bare IPs.
const verifyUrlReplacement = `const verifyUrl = (url) => {
    if (!url || url.length === 0)
        return false;
    // Local-SP patch: accept any parseable http(s) URL with a hostname
    // (the upstream regex requires a dotted domain + alpha TLD, rejecting
    // "greenfield-local" and "127.0.0.1").
    try {
        const u = new URL(url.includes('://') ? url : \`http://\${url}\`);
        if (!u.hostname) throw new Error('Invalid endpoint');
    } catch (e) {
        throw new Error('Invalid endpoint');
    }
};`;

// generateUrlByBucketName: PATH-STYLE (<endpoint>/<bucket>) not vhost.
const generateUrlReplacement = `const generateUrlByBucketName = (endpoint = '', bucketName) => {
    verifyBucketName(bucketName);
    verifyUrl(endpoint);
    // Local-SP patch: PATH-STYLE addressing avoids needing wildcard DNS for
    // <bucket>.<domain> across docker containers; gnfd-sp serves it via the
    // PathPrefix("/{bucket}") subrouter (modular/gater/router.go).
    return \`\${endpoint.replace(/\\/+$/, '')}/\${bucketName}\`;
};`;

// getPutObjectMetaInfo URL block: keep bucket in the path, and sign the full
// path + host WITH port so the canonical request matches gnfd-sp's
// (commonhttp.GetCanonicalRequest signs req.URL.Path + the Host header).
const putMetaOriginal = `    let url = new URL(path, generateUrlByBucketName(endpoint, bucketName));
    url = getSortQueryParams(url, queryMap);
    const reqMeta = {
        contentSHA256: EMPTY_STRING_SHA256,
        txnHash: txnHash,
        method: METHOD_PUT,
        url: {
            hostname: url.hostname,
            query: url.searchParams.toString(),
            path,
        },
        contentType,
    };`;
const putMetaReplacement = `    // Local-SP patch: path-style base already ends with /<bucket>; concatenate
    // the object path (new URL(absolutePath, base) would drop the bucket).
    // Sign the FULL path and host WITH port to match gnfd-sp's canonical request.
    const base = generateUrlByBucketName(endpoint, bucketName);
    let url = new URL(base + path);
    url = getSortQueryParams(url, queryMap);
    const reqMeta = {
        contentSHA256: EMPTY_STRING_SHA256,
        txnHash: txnHash,
        method: METHOD_PUT,
        url: {
            hostname: url.host,
            query: url.searchParams.toString(),
            path: url.pathname,
        },
        contentType,
    };`;

// Replace the body of a top-level `const NAME = ...;` declaration that spans
// up to the next given anchor. Idempotent: skips if already patched.
function replaceByAnchor(code, startAnchor, endAnchor, replacement, marker, label) {
    if (code.includes(marker)) {
        console.log('  - ' + label + ': already patched');
        return code;
    }
    const startIdx = code.indexOf(startAnchor);
    if (startIdx === -1) {
        console.log('  - ' + label + ': anchor not found, skipping');
        return code;
    }
    const endIdx = code.indexOf(endAnchor, startIdx);
    if (endIdx === -1) {
        console.log('  - ' + label + ': end anchor not found, skipping');
        return code;
    }
    console.log('  - ' + label + ': patched');
    return code.substring(0, startIdx) + replacement + '\n' + code.substring(endIdx);
}

function replaceExact(code, original, replacement, marker, label) {
    if (code.includes(marker)) {
        console.log('  - ' + label + ': already patched');
        return code;
    }
    if (!code.includes(original)) {
        console.log('  - ' + label + ': original block not found, skipping');
        return code;
    }
    console.log('  - ' + label + ': patched');
    return code.replace(original, replacement);
}

function patchFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log('File does not exist: ' + filePath);
        return;
    }
    let code = fs.readFileSync(filePath, 'utf8');
    console.log('Patching ' + filePath);

    // 1. createEIP712 (anchored, replaces whole declaration up to generateMessage)
    const startIdx = code.indexOf('const createEIP712 =');
    const endIdx = startIdx === -1 ? -1 : code.indexOf('const generateMessage =', startIdx);
    if (startIdx !== -1 && endIdx !== -1) {
        code = code.substring(0, startIdx) + replacement + '\n' + code.substring(endIdx);
        console.log('  - createEIP712: patched');
    } else {
        console.log('  - createEIP712: anchors not found, skipping');
    }

    // 2. verifyUrl
    code = replaceByAnchor(code, 'const verifyUrl = (url) => {', 'const trimString =',
        verifyUrlReplacement, 'Local-SP patch: accept any parseable', 'verifyUrl');

    // 3. generateUrlByBucketName
    code = replaceByAnchor(code, 'const generateUrlByBucketName =', 'const isSQLInjection =',
        generateUrlReplacement, 'Local-SP patch: PATH-STYLE addressing', 'generateUrlByBucketName');

    // 4. getPutObjectMetaInfo URL/signing block
    code = replaceExact(code, putMetaOriginal, putMetaReplacement,
        'Sign the FULL path and host WITH port', 'getPutObjectMetaInfo');

    fs.writeFileSync(filePath, code, 'utf8');
    console.log('Successfully patched ' + filePath);
}

const paths = [
    'smartcontracts/greenfield-testnet/node_modules/@bnb-chain/greenfield-js-sdk/dist/cjs/index.js',
    'smartcontracts/e2e/node_modules/@bnb-chain/greenfield-js-sdk/dist/cjs/index.js'
];

paths.forEach(patchFile);
