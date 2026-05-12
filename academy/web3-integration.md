# Daskibo Academy — Web3 Integration Guide

## Overview

Authentication on Daskibo Academy is wallet-based. No username or password is required. Users sign in by:

1. Connecting their MetaMask wallet
2. Switching to the **Unit Zero Mainnet** network
3. Signing a plain-English ownership message

The signed message is stored client-side (cookie + localStorage) and can be verified server-side when a backend is added.

---

## Network: Unit Zero Mainnet

| Parameter | Value |
|-----------|-------|
| Chain Name | Unit Zero Mainnet |
| Chain ID (decimal) | 88811 |
| Chain ID (hex) | 0x15AEB |
| RPC URL | https://rpc.unit0.dev |
| Block Explorer | https://explorer.unit0.dev |
| Native Currency | UNIT0 (18 decimals) |
| Source | [ChainList #88811](https://chainlist.org/chain/88811) |

---

## Auth Flow (Detailed)

```
User clicks "Connect MetaMask"
        │
        ▼
1. Check window.ethereum.isMetaMask
        │ not found → show error (i18n-aware)
        │ found ↓
        ▼
2. eth_requestAccounts
        │ user rejects → catch → show error
        │ approved → address[0]
        ▼
3. wallet_switchEthereumChain { chainId: '0x15AEB' }
        │ error.code === 4902 (chain unknown) →
        │   wallet_addEthereumChain { ...UNIT0_CHAIN }
        │ user rejects → catch → show error
        │ success ↓
        ▼
4. personal_sign(SIGN_MESSAGE, address)
        │ user rejects → catch → show error
        │ success → sig
        ▼
5. setSession(address, sig)
        │ Write cookie (7-day, SameSite=Lax)
        │ Write localStorage
        ▼
6. Emit 'walletConnected' CustomEvent → page redirects
```

---

## Ownership Message

The message is fixed and must not be localised — it is the legal consent text and must be signed in English:

```
I am the owner of this wallet. I agree to save my progress via cookies
and to receive a certificate upon completion of practical tasks on Daskibo Academy.
```

Available via `Web3Auth.SIGN_MESSAGE`.

---

## Session Storage

### Cookie
```
daskibo_wallet=<address>; Expires=<7-days>; Path=/; SameSite=Lax
daskibo_sig=<hex-sig>;    Expires=<7-days>; Path=/; SameSite=Lax
```

`SameSite=Lax` (not `Strict`) allows the cookie to be sent on top-level navigations from external links, which is appropriate for a public academy.  
`HttpOnly` is **not** set because a backend is not yet implemented — the cookie is read by client JS. Add `HttpOnly` when a server-side session endpoint is available.

### localStorage
Same keys (`daskibo_wallet`, `daskibo_sig`) for instant client-side checks without cookie parsing.

---

## Server-Side Verification (Future)

When a backend is added, verify the session with:

```python
from eth_account.messages import encode_defunct
from eth_account import Account

def verify_signature(address: str, signature: str, message: str) -> bool:
    msg = encode_defunct(text=message)
    recovered = Account.recover_message(msg, signature=signature)
    return recovered.lower() == address.lower()
```

Or in Node.js (ethers v6):
```js
import { ethers } from 'ethers';
const recovered = ethers.verifyMessage(SIGN_MESSAGE, signature);
const valid = recovered.toLowerCase() === address.toLowerCase();
```

---

## On-Chain Certificates (Future)

Upon completing all practical labs, a certificate NFT (ERC-721) will be minted on Unit Zero Mainnet:

```solidity
// DaskiboCertificate.sol (planned)
function mintCertificate(
    address student,
    uint256 courseId,
    string calldata ipfsMetadata
) external onlyMinter {
    uint256 tokenId = _nextTokenId++;
    _safeMint(student, tokenId);
    _setTokenURI(tokenId, ipfsMetadata);
    emit CertificateMinted(student, courseId, tokenId, block.timestamp);
}
```

Metadata (IPFS):
```json
{
  "name": "Daskibo Academy — Claude Code Practitioner",
  "description": "Awarded for completing Course 02: Claude Code (21 lessons, 12 labs)",
  "attributes": [
    { "trait_type": "Course", "value": "Claude Code" },
    { "trait_type": "Course ID", "value": 2 },
    { "trait_type": "Completed", "value": "<ISO-date>" }
  ]
}
```

---

## Public JS API

```js
// Check MetaMask presence
Web3Auth.hasMetaMask() // → boolean

// Full connect + switch + sign flow
await Web3Auth.connectAndSign() // → { address: '0x...', sig: '0x...' }

// Manual network switch only
await Web3Auth.switchToUnit0()

// Read current session
Web3Auth.getSession()  // → { address, sig } | null

// Logout
Web3Auth.clearSession()

// Constants
Web3Auth.UNIT0_CHAIN   // chain config object
Web3Auth.SIGN_MESSAGE  // canonical message string
```

---

## Error Handling

| Error | Cause | UX Response |
|-------|-------|-------------|
| `METAMASK_NOT_FOUND` | No MetaMask extension | i18n error message + install link |
| User rejected account access | MetaMask popup dismissed | Error message, button re-enabled |
| User rejected chain switch | Declined network switch | Error message, button re-enabled |
| 4902 (chain not added) | First-time Unit0 user | Automatically calls `addEthereumChain` |
| User rejected sign | Declined personal_sign | Error message, button re-enabled |

All errors surface in `#web3-error` `<div>` with `role="alert"` styling.
