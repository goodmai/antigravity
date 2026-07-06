# Lit Actions — TEE JavaScript

> Source: `docs/litActions/overview.mdx`, `docs/litActions/examples.mdx`, `docs/litActions/patterns.mdx`
> https://github.com/LIT-Protocol/chipotle (branch: next)

---

## What is a Lit Action?

Immutable JavaScript program stored on IPFS. Executed inside the Phala TEE.

Key properties:
- Identified by **CID** (content-addressable — code is the identity)
- **Not owned by anyone** — public, reusable across accounts (like npm packages)
- Runs in a sandboxed JS environment with access to TEE-derived keys
- Any account can reference any CID in its groups
- **Fork = new CID = new identity** — immutable commitment to the code

---

## Available Globals

| Global | Type | Description |
|--------|------|-------------|
| `params` | object | The `js_params` object passed by the caller |
| `ethers` | object | ethers.js v5 (full library) |
| `fetch` | function | HTTP requests (outbound allowed from TEE) |
| `Lit.Actions.Encrypt({ pkpId, message })` | async fn | AES-GCM encrypt with PKP-derived symmetric key |
| `Lit.Actions.Decrypt({ pkpId, ciphertext })` | async fn | Decrypt with PKP-derived key |
| `Lit.Actions.getPrivateKey({ pkpId })` | async fn | Get PKP secp256k1 private key (for signing) |
| `Lit.Actions.getLitActionPrivateKey()` | async fn | Get this action's own identity key (from CID) |
| `Lit.Actions.setResponse({ response })` | fn | Legacy: set response. Prefer `return` instead. |

**Return pattern**: `return { key: value }` → caller receives `response.key`.

---

## Writing Actions

### Minimal action (inline code)

```js
// Passed as `code` string in /lit_action request
async function main({ pkpId, message }) {
  const ciphertext = await Lit.Actions.Encrypt({ pkpId, message });
  return { ciphertext };
}
```

### IPFS action (recommended for production)

1. Write the JS file
2. Upload to IPFS → get CID
3. Register CID in your group (`/add_action`)
4. Execute by CID (`code_cid` field instead of `code`)

```js
// Execute by CID
const res = await fetch(`${BASE}/core/v1/lit_action`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
  body: JSON.stringify({
    code_cid: 'QmYourActionCID',
    js_params: { pkpId, message: 'secret' },
  }),
});
```

---

## Action Identity Key

`getLitActionPrivateKey()` returns a key derived from the IPFS CID — not from any PKP.

Use case: the action can sign data with its own identity, proving "this specific code ran."

```js
async function main({ data }) {
  const key = await Lit.Actions.getLitActionPrivateKey();
  const wallet = new ethers.Wallet(key);
  const sig = await wallet.signMessage(JSON.stringify(data));
  return { sig, signerAddress: wallet.address };
}
```

Two different CIDs = two different identity keys. If you fork the code, the identity changes — useful for on-chain verifier contracts that whitelist specific CIDs.

---

## Encrypt / Decrypt

```js
// Encrypt
async function main({ pkpId, secret }) {
  const ciphertext = await Lit.Actions.Encrypt({ pkpId, message: secret });
  return { ciphertext };
}

// Decrypt (no gate — bare decrypt)
async function main({ pkpId, ciphertext }) {
  const plaintext = await Lit.Actions.Decrypt({ pkpId, ciphertext });
  return { plaintext };
}
```

The symmetric key is derived from the PKP inside the TEE — **never returned to the caller**.
`ciphertext` is safe to store anywhere (IPFS, Greenfield, chain).

---

## Access Control Patterns

Access control in Chipotle = plain JavaScript inside the action. No ACC builder.

### Address gate

```js
async function main({ pkpId, ciphertext, userAddress, allowedAddress }) {
  if (userAddress.toLowerCase() !== allowedAddress.toLowerCase()) {
    return { error: 'Access denied' };
  }
  return { plaintext: await Lit.Actions.Decrypt({ pkpId, ciphertext }) };
}
```

### NFT gate (on-chain check)

```js
async function main({ pkpId, ciphertext, holderAddress, nftContract, rpcUrl }) {
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const nft = new ethers.Contract(
    nftContract,
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );
  const balance = await nft.balanceOf(holderAddress);
  if (balance.eq(0)) return { error: 'NFT not held' };
  return { plaintext: await Lit.Actions.Decrypt({ pkpId, ciphertext }) };
}
```

### AccessPass gate (Daskibo pattern)

```js
async function main({ pkpId, ciphertext, userAddress, courseId, accessPassContract, rpcUrl }) {
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const ap = new ethers.Contract(
    accessPassContract,
    ['function hasAccess(address,uint256) view returns (bool)'],
    provider
  );
  const ok = await ap.hasAccess(userAddress, courseId);
  if (!ok) return { error: 'No valid AccessPass' };
  return { decrypted: await Lit.Actions.Decrypt({ pkpId, ciphertext }) };
}
```

### Multi-condition gate (AND logic)

```js
async function main({ pkpId, ciphertext, userAddress, courseId, nftContract, accessPassContract, rpcUrl }) {
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  
  // Check both conditions
  const [nft, ap] = await Promise.all([
    new ethers.Contract(nftContract, ['function balanceOf(address) view returns (uint256)'], provider)
      .balanceOf(userAddress),
    new ethers.Contract(accessPassContract, ['function hasAccess(address,uint256) view returns (bool)'], provider)
      .hasAccess(userAddress, courseId),
  ]);
  
  if (nft.eq(0) && !ap) return { error: 'No access rights' };
  return { decrypted: await Lit.Actions.Decrypt({ pkpId, ciphertext }) };
}
```

---

## Signing Patterns

### Sign an arbitrary message with PKP

```js
async function main({ pkpId, message }) {
  const privateKey = await Lit.Actions.getPrivateKey({ pkpId });
  const wallet = new ethers.Wallet(privateKey);
  const sig = await wallet.signMessage(message);
  return { sig, signerAddress: wallet.address };
}
```

### Sign a transaction

```js
async function main({ pkpId, txData }) {
  const privateKey = await Lit.Actions.getPrivateKey({ pkpId });
  const wallet = new ethers.Wallet(privateKey);
  const signedTx = await wallet.signTransaction(txData);
  return { signedTx };
}
```

Note: `getPrivateKey` only works inside a Lit Action. The key never leaves the TEE.

---

## HTTP Requests Inside Actions

Actions can make outbound HTTP requests:

```js
async function main({ pkpId, ciphertext, userId }) {
  // Call your backend to check subscription
  const res = await fetch(`https://api.yourapp.com/check-subscription?userId=${userId}`);
  const { active } = await res.json();
  if (!active) return { error: 'Subscription required' };
  return { decrypted: await Lit.Actions.Decrypt({ pkpId, ciphertext }) };
}
```

Useful for: subscription checks, off-chain allowlists, webhook calls, external price feeds.

---

## Uploading to IPFS

```bash
# Using IPFS CLI
ipfs add --cid-version 1 my-action.js
# → bafybeig...CID

# Using web3.storage / Pinata / NFT.storage programmatically
# (any pinning service works — Lit just fetches by CID at runtime)
```

---

## Inline vs IPFS — trade-offs

| | Inline `code` | IPFS `code_cid` |
|---|---|---|
| Development speed | Fast — no upload step | Requires upload + wait |
| Auditability | Not independently verifiable | CID = content hash = provable |
| Immutability | Caller controls the code | Fixed by CID — can't change |
| Group registration | Not required | Required (`/add_action`) |
| Trust model | Weaker — server sees code | Stronger — code is hash-committed |

Use inline for **development and testing**. Use IPFS CIDs for **production**.

---

## Error Handling

```js
// Always return a structured error — don't throw unhandled
async function main({ pkpId, ciphertext, userAddress }) {
  try {
    if (!userAddress) return { error: 'userAddress required' };
    const ok = await checkAccess(userAddress);
    if (!ok) return { error: 'Access denied', code: 403 };
    return { decrypted: await Lit.Actions.Decrypt({ pkpId, ciphertext }) };
  } catch (e) {
    return { error: e.message };
  }
}
```

The `/lit_action` response shape:
```json
{
  "response": { "decrypted": "..." },    // your return value
  "has_error": false,
  "logs": "..."
}
```

On error: `{ "has_error": true, "error": "...", "response": null }`.
