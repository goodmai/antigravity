# API Mode vs ChainSecured Mode

> Source: `docs/management/account_modes.mdx`
> https://github.com/LIT-Protocol/chipotle (branch: next)

Both modes use the same `/core/v1` API for **executing** Lit Actions.
The difference is only in **administrative operations** (create group, add action, register PKP, mint usage key).

---

## Side-by-side comparison

| Dimension | API mode (managed) | ChainSecured mode |
|-----------|-------------------|------------------|
| Account owner | Wallet derived from server-generated random secret | Your wallet (EOA / Safe / contract) on **Base** |
| Account-level credential | Base64 API key (`X-Api-Key` header) | None — wallet signature is the credential |
| Admin write path | HTTP `POST /core/v1/...` → server submits tx to Base | Direct contract call from your wallet to Base |
| Gas for admin writes | Server pays (covered by credit charge) | You pay from your wallet (Base ETH) |
| Recovery | Retain/back up the API key | Whatever your wallet supports (seed, Safe signers) |
| On-chain `managed` flag | `true` | `false` |
| Onboarding speed | Fastest — email → API key | Requires a funded Base wallet |
| Trust model | You trust Lit's server to relay your intent | Trust-minimized — every admin write is on-chain |
| Auditability | Server logs + on-chain events | On-chain events only, every change wallet-signed |
| Lit Action execution | Usage API key in `X-Api-Key` | Usage API key in `X-Api-Key` (minted from contract) |
| Billing | Stripe credits | Stripe credits (same flow) |
| Dashboard | Same UI | Same UI; writes prompt wallet |

---

## API mode — setup

```javascript
// 1. Create account (shown once — save api_key immediately)
const res = await fetch('https://api.chipotle.litprotocol.com/core/v1/new_account', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ accountName: 'My App', email: 'me@example.com' }),
});
const { api_key, wallet_address } = await res.json();

// 2. Create a PKP wallet
const pkp = await fetch('https://api.chipotle.litprotocol.com/core/v1/create_wallet', {
  headers: { 'X-Api-Key': api_key },
}).then(r => r.json());
const pkpId = pkp.wallet_address; // = Ethereum address

// 3. All admin writes go over HTTP with api_key
// Server handles Base gas automatically from your credit balance
```

---

## ChainSecured mode — setup

```javascript
// Your wallet (e.g. 3-of-5 Safe on Base) becomes the account owner directly on-chain.
// No /new_account call. Instead, deploy or interact with the AccountConfig contract on Base.

// Admin writes require a Base wallet signature — Safe transaction, multisig vote, etc.
// Lit Action execution still uses a Usage API key minted from the contract.

// Example: add a group via direct Base tx (ChainSecured)
const iface = new ethers.utils.Interface(['function addGroup(string) returns (uint256)']);
const tx = await safeWallet.sendTransaction({
  to: CHIPOTLE_ACCOUNT_CONTRACT_ON_BASE,
  data: iface.encodeFunctionData('addGroup', ['my-course-group']),
});
```

---

## When to choose

### Choose API mode when:
- Prototyping or fast iteration
- Server/cron job needs a single shared credential
- You don't require every config change to be on-chain
- Gas management is friction you don't want

### Choose ChainSecured mode when:
- **Multisig or DAO governs configuration** — every action upgrade, PKP addition = Safe proposal
- **Full on-chain audit trail** — every admin op wallet-signed and visible on Base
- **Zero trust in relay** — no third party (including Lit) can modify groups or PKPs without your signature
- Building a wallet-native dApp where the user's wallet is the natural authority

---

## Base blockchain — what goes on-chain (both modes)

In both modes, the following state is stored on **Base**:

| What | Base contract |
|------|--------------|
| Account owner address | `AccountConfig` |
| API key addresses → scopes | `ApiKeyRegistry` |
| PKP derivation path IDs | `PkpRegistry` |
| Groups: `{pkp_ids, action_cids}` | `AccountConfig` / `Groups` |

In **API mode**, the Chipotle server (TEE relay) submits these Base txs on your behalf after verifying your HTTP API key.

In **ChainSecured mode**, you (or your Safe) submit these txs directly. The TEE reads the same Base contracts — it just can't write them for you.

---

## Daskibo production recommendation

For the Daskibo platform mainnet (Flow E):
- **Alice's governance** → ChainSecured mode with 3-of-5 Safe on Base
  - Every group/action/PKP change requires a Safe vote → on-chain audit trail
  - Lit Action CID upgrades (new course decrypt action) go through Safe proposal
- **Bob (course publisher)** → API mode usage key scoped to their course group
  - Rotatable, revocable, can't touch other groups
- **Deployer** → API mode account key for their tenant instance
  - Or ChainSecured with their own Safe if they require self-sovereignty
