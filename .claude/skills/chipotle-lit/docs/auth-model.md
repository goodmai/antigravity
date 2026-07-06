# Authentication Model

> Source: `docs/architecture/authModel.mdx`, `docs/architecture/groups.mdx`, `docs/management/api_keys.mdx`
> https://github.com/LIT-Protocol/chipotle (branch: next)

---

## Core insight

**There are no modes.** Self-sovereign vs SaaS is an emergent property of:
1. Who is the Account Owner (TEE-derived wallet vs SAFE vs raw EOA)
2. What scopes the API keys have

A "self-sovereign" setup = `owner=SAFE, API keys=execute-only`.
A "SaaS" setup = `owner=TEE-derived wallet, API keys=broad scopes`.
The contracts don't know or care.

---

## Entities

### Account

The top-level identity. Just an address on **Base**. This address is the **owner** — it can do everything, and it's the only thing that can do structural/destructive operations.

Owner address can be:
- **EOA** — simple, but no recovery
- **TEE-derived wallet** — SaaS happy path: user authenticates via Stytch (email/passkey/OAuth), TEE verifies Stytch token, derives deterministic wallet from user ID
- **SAFE or governance contract** — self-sovereign: multisig, voting, timelocks

The contracts treat all three identically: `msg.sender == owner`.

### API Key (Account Key)

Created once at `/new_account`. **Shown once — copy immediately.**

- Master credential for the account
- Full administrative access: create/delete usage keys, manage groups, register actions, create PKPs
- Auth: `X-Api-Key: <key>` or `Authorization: Bearer <key>`
- **Never embed in client-side code.** Store in secrets manager.
- Lost → contact Lit support (no recovery path)

### API Key (Usage Key)

Scoped, rotatable keys for day-to-day operations. Created from the dashboard or API.

**7 scopes — 4 are per-group:**

| Scope | What it allows | Scoped to |
|-------|---------------|-----------|
| `execute` | Invoke Lit Actions with PKPs | Per-group |
| `pkp:create` | Create new PKPs in account's registry | Account-wide |
| `group:create` | Create new groups | Account-wide |
| `group:delete` | Delete groups | Account-wide |
| `group:manageActions` | Add/remove action CIDs in a group | Per-group |
| `group:addPkp` | Add PKP references to a group | Per-group |
| `group:removePkp` | Remove PKP references from a group | Per-group |

`[0]` in the group array = **wildcard** (all groups). Use sparingly.

**Security property**: a leaked onboarding key with `group:addPkp(group_1)` can only add PKPs to `group_1` — not to any other group. Because it lacks `group:removePkp`, it also can't pull existing PKPs out.

**Everything else is owner-only**: adding/revoking API keys, updating scopes, transferring ownership.

### PKP (Programmable Key Pair)

A wallet — an elliptic-curve key pair — managed by the Lit network.

- On-chain: a **derivation path ID** stored in the account's PKP Registry on Base
- The actual key material exists **only transiently inside the TEE**, derived on demand from the root key
- PKP ID = Ethereum address (the public key)
- Never persisted, never leaves the TEE boundary

PKPs are created in the account registry (`/create_wallet`), then referenced by Groups.

### Lit Action

Immutable JS code on IPFS, identified by **CID**. **Not owned by anyone.**

- Public, content-addressed, reusable across accounts (like npm packages)
- Any account can reference any CID in its groups
- Audited, well-known action CIDs → ecosystem value
- `Lit.Actions.getLitActionPrivateKey()` = key derived from the CID itself

### Group

The **core authorization primitive**. Binds together:
- Set of **PKP references** (from the account's PKP Registry)
- Set of **Action CIDs** (any valid IPFS CID — no registration required)

"Can this action use this PKP?" = determined by group membership.
"Can this caller use this group?" = determined by API key scopes.

Groups are owned by the Account. Only the owner can create or delete them. PKPs can appear in multiple groups. The same action CID can appear across unrelated accounts.

```
Account
 └── Group
      ├── PKP: "course-vault-01" (derives key for this course's encryption)
      ├── CID: "Qm...daskibo-decrypt-action" (the decrypt gate logic)
      └── Usage Key: scoped to execute in this group
```

**Wildcard PKP**: include zero-value bytes32 in `pkp_ids_permitted` = any PKP in the account.
**Wildcard actions**: include `0` in `cid_hashes_permitted` = any CID.

### Root Key

Master secret managed by Phala's TEE KMS. **Never leaves the enclave.** Approved TEE build images derive PKP key material from it on demand. This is the trust anchor for all encryption/signing.

---

## Execution flow (step by step)

1. Caller sends `POST /core/v1/lit_action` with API key + code + js_params
2. TEE derives API key's address
3. On-chain lookup: what scopes does this address have?
4. Does the request target a group? Is the action CID in that group? Is the PKP in that group?
5. All checks pass → derive key material from root key via PKP's derivation path
6. Fetch action code from IPFS by CID
7. Execute in sandboxed JS (code sees derived keys via `Lit.Actions.*`)
8. Return result — key material stays in TEE

---

## API key management

```bash
# Create a usage key (account key required)
curl -X POST https://api.chipotle.litprotocol.com/core/v1/add_usage_api_key \
  -H "X-Api-Key: $ACCOUNT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "daskibo-publisher", "can_create_groups": false, "execute_in_groups": [1]}'

# List usage keys
curl https://api.chipotle.litprotocol.com/core/v1/list_api_keys \
  -H "X-Api-Key: $ACCOUNT_KEY"

# Revoke a usage key
curl -X POST https://api.chipotle.litprotocol.com/core/v1/remove_usage_api_key \
  -H "X-Api-Key: $ACCOUNT_KEY" \
  -d '{"api_key_address": "0x..."}'
```

---

## Daskibo permission matrix

| Role | Key type | Scopes | Groups |
|------|----------|--------|--------|
| Alice (governance) | Account key | All | All |
| Bob (publisher) | Usage key | `execute`, `pkp:create`, `group:create` | wildcard |
| Course service (CI) | Usage key | `execute` | specific course group only |
| Deployer instance | Account key (their own account) | All on their account | Their account |
