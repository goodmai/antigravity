# Pricing — Credits and Payments

> Source: `docs/management/billing.mdx`, `docs/management/payments.mdx`
> https://github.com/LIT-Protocol/chipotle (branch: next)

---

## Model

Chipotle uses **credit-based billing**. Credits are pre-purchased and consumed per operation.

| Operation type | Cost |
|----------------|------|
| Lit Action execution | $0.01 per second |
| Management calls (create PKP, add group, etc.) | $0.01 per second |
| ECDSA signatures (< 1 second) | Effectively $0.01 each |
| Read-only GET requests | **Free** |

Minimum top-up: $5.

---

## Credit Packages

| Package | Credits | Price |
|---------|---------|-------|
| Starter | 500 cr | $5 |
| Standard | 1,000 cr | $10 |
| Growth | 2,500 cr | $25 |
| Scale | 5,000 cr | $50 |

1 credit = $0.01 = 1 second of compute.

---

## Payment Methods

Via **Stripe** — both traditional and crypto:

| Method | Notes |
|--------|-------|
| Credit/debit card | Standard Stripe flow |
| ETH | On Base network |
| USDC | On Base network |
| SOL | Solana |

Crypto payments route through Stripe's crypto integration on Base.

---

## Credit Balance API

```bash
# Check balance
curl https://api.chipotle.litprotocol.com/core/v1/billing/balance \
  -H "X-Api-Key: $ACCOUNT_KEY"
# → {"balance": 4.87, "currency": "USD"}
```

When balance is exhausted, the API returns **HTTP 402 Payment Required**.

---

## Dashboard

Top up credits, view usage history, download invoices:
https://dashboard.chipotle.litprotocol.com

---

## Gas Costs (ChainSecured mode)

In **ChainSecured mode**, admin writes (create group, add action, register PKP) are direct transactions to Base smart contracts — gas is paid from **your Base ETH wallet**, not from Chipotle credits.

Lit Action execution always uses credits, regardless of mode.

In **API mode**, the Chipotle TEE relay pays Base gas from its own wallet (covered by your credits).

---

## Cost Estimation

| Use case | Operations | Estimated cost |
|----------|-----------|----------------|
| Encrypt a course key (1 call, ~0.5s) | 1 exec | ~$0.005 |
| Decrypt per user access (1 call, ~0.5s) | 1 exec | ~$0.005 |
| Create PKP (~1s) | 1 mgmt | ~$0.01 |
| Create group (~1s) | 1 mgmt | ~$0.01 |
| 1,000 decrypt calls per day | 1,000 exec | ~$5/day |
| Onboarding 100 new users (PKP + group each) | 200 mgmt | ~$2 |

Rough Daskibo devnet budget: $5/month covers typical development usage.

---

## Local Dev (Free)

The Chipotle mock at `http://localhost:8000` has no billing — all operations are free and unlimited.

```bash
# No credits needed for local development
curl http://localhost:8000/core/v1/billing/balance
# → mock always returns sufficient balance (or endpoint may not exist)
```
