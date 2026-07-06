# API Reference

> Source: OpenAPI spec at https://api.chipotle.litprotocol.com/core/v1/swagger-ui
> Base URL: `https://api.chipotle.litprotocol.com/core/v1`
> Local mock: `http://localhost:8000/core/v1`

Auth header: `X-Api-Key: <key>` or `Authorization: Bearer <key>`

---

## Account Management

### POST /new_account
Create a new account. **Returns `api_key` once — copy immediately.**

```bash
curl -X POST $BASE/core/v1/new_account \
  -H "Content-Type: application/json" \
  -d '{"accountName": "My App", "email": "me@example.com"}'
```
Response: `{ "api_key": "base64...", "wallet_address": "0x..." }`

### GET /get_account_info
Get account details (owner address, managed flag, name).

```bash
curl $BASE/core/v1/get_account_info -H "X-Api-Key: $KEY"
```

### POST /transfer_ownership
Transfer account ownership to a new address (owner key required).

```bash
curl -X POST $BASE/core/v1/transfer_ownership \
  -H "X-Api-Key: $ACCOUNT_KEY" \
  -d '{"new_owner": "0x..."}'
```

---

## PKP (Wallet) Management

### GET /create_wallet
Mint a new PKP. Returns the PKP's Ethereum address (= pkpId).

```bash
curl $BASE/core/v1/create_wallet -H "X-Api-Key: $KEY"
# → { "wallet_address": "0x...", "derivation_path": "m/44'/60'/0'/0/N" }
```

### GET /list_wallets
List all PKPs in the account's registry.

```bash
curl $BASE/core/v1/list_wallets -H "X-Api-Key: $KEY"
# → [{ "wallet_address": "0x...", "name": "...", "created_at": "..." }]
```

### POST /delete_wallet
Remove a PKP from the registry (owner key required).

```bash
curl -X POST $BASE/core/v1/delete_wallet \
  -H "X-Api-Key: $ACCOUNT_KEY" \
  -d '{"wallet_address": "0x..."}'
```

---

## Group Management

### POST /add_group
Create a new group. Returns `group_id`.

```bash
curl -X POST $BASE/core/v1/add_group \
  -H "X-Api-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "course-1-group"}'
# → { "group_id": 1 }
```

### GET /list_groups
List all groups in the account.

```bash
curl $BASE/core/v1/list_groups -H "X-Api-Key: $KEY"
```

### POST /delete_group
Delete a group (owner key required).

```bash
curl -X POST $BASE/core/v1/delete_group \
  -H "X-Api-Key: $ACCOUNT_KEY" \
  -d '{"group_id": 1}'
```

### POST /add_pkp_to_group
Add a PKP reference to a group.

```bash
curl -X POST $BASE/core/v1/add_pkp_to_group \
  -H "X-Api-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"group_id": 1, "wallet_address": "0x..."}'
```

### POST /remove_pkp_from_group
Remove a PKP reference from a group.

```bash
curl -X POST $BASE/core/v1/remove_pkp_from_group \
  -H "X-Api-Key: $KEY" \
  -d '{"group_id": 1, "wallet_address": "0x..."}'
```

---

## Action (CID) Management

### POST /add_action
Register an IPFS action CID in a group.

```bash
curl -X POST $BASE/core/v1/add_action \
  -H "X-Api-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"group_id": 1, "cid": "QmYourCID"}'
```

### GET /list_actions
List all registered action CIDs in a group.

```bash
curl "$BASE/core/v1/list_actions?group_id=1" -H "X-Api-Key: $KEY"
```

### POST /remove_action
Remove an action CID from a group.

```bash
curl -X POST $BASE/core/v1/remove_action \
  -H "X-Api-Key: $KEY" \
  -d '{"group_id": 1, "cid": "QmYourCID"}'
```

---

## API Key Management

### POST /add_usage_api_key
Create a scoped usage key.

```bash
curl -X POST $BASE/core/v1/add_usage_api_key \
  -H "X-Api-Key: $ACCOUNT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "course-service",
    "execute_in_groups": [1],
    "can_create_pkps": false,
    "can_create_groups": false,
    "can_delete_groups": false,
    "manage_actions_in_groups": [],
    "add_pkps_in_groups": [],
    "remove_pkps_in_groups": []
  }'
# → { "api_key": "...", "api_key_address": "0x..." }
```

Scope fields map directly to the 7 scopes. Use `[0]` for wildcard.

### GET /list_api_keys
List all usage keys and their scopes.

```bash
curl $BASE/core/v1/list_api_keys -H "X-Api-Key: $ACCOUNT_KEY"
```

### POST /remove_usage_api_key
Revoke a usage key.

```bash
curl -X POST $BASE/core/v1/remove_usage_api_key \
  -H "X-Api-Key: $ACCOUNT_KEY" \
  -d '{"api_key_address": "0x..."}'
```

### POST /update_usage_api_key_scopes
Update scopes on an existing usage key.

```bash
curl -X POST $BASE/core/v1/update_usage_api_key_scopes \
  -H "X-Api-Key: $ACCOUNT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"api_key_address": "0x...", "execute_in_groups": [1, 2]}'
```

---

## Lit Action Execution

### POST /lit_action
Execute a Lit Action in the TEE. Core endpoint.

```bash
curl -X POST $BASE/core/v1/lit_action \
  -H "X-Api-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "async function main(p) { return { ok: true }; }",
    "js_params": {},
    "group_id": 1,
    "pkp_id": "0x..."
  }'
```

**Fields:**
| Field | Required | Description |
|-------|----------|-------------|
| `code` | one of | Inline JS string |
| `code_cid` | one of | IPFS CID of the action |
| `js_params` | yes | Object passed as `params` inside the action |
| `group_id` | no | Target group (required if using scoped key) |
| `pkp_id` | no | PKP to use for key operations |

**Response:**
```json
{
  "response": { "your": "return value" },
  "has_error": false,
  "error": null,
  "logs": "console output...",
  "signatures": {}
}
```

---

## Server / Health

### GET /version
Server info + PKP address. Also used to verify TEE attestation.

```bash
curl $BASE/core/v1/version
# → {
#     "name": "chipotle",
#     "version": "0.4.1",
#     "mode": "production",
#     "pkp": "0x...",
#     "phala_report_url": "https://..."
#   }
```

Local mock returns `"name": "chipotle-mock"`.

---

## Billing

### GET /billing/balance
Get current credit balance.

```bash
curl $BASE/core/v1/billing/balance -H "X-Api-Key: $KEY"
# → { "balance": 4.87, "currency": "USD" }
```

### GET /billing/usage
Get usage history.

```bash
curl $BASE/core/v1/billing/usage -H "X-Api-Key: $KEY"
```

### POST /billing/add_credits
Add credits via Stripe payment intent.

---

## Error Codes

| HTTP | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request (invalid params, missing field) |
| 401 | Unauthorized (bad or missing API key) |
| 403 | Forbidden (key lacks required scope) |
| 402 | Payment Required (credits exhausted) |
| 404 | Not found (group/PKP/action doesn't exist) |
| 500 | Internal server error (retry up to 3×) |

All errors include `{ "error": "description" }` in the body.
