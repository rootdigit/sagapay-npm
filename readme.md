# SagaPay SDK

## SagaPay: Blockchain Payment Processing Simplified

SagaPay (https://sagapay.io) is the world's first free, non-custodial blockchain payment gateway service provider, enabling businesses to seamlessly integrate cryptocurrency payments without holding customer funds. With enterprise-grade security and zero transaction fees, SagaPay empowers merchants to accept crypto payments across multiple blockchains while maintaining full control of their digital assets.

## Installation
```bash
npm install sagapay-sdk
```

## Initialization
```javascript
import { SagaPayClient } from 'sagapay-sdk';

const client = new SagaPayClient('your-api-key', 'your-api-secret');
```

## Features
- Deposit address generation  
- Withdrawal processing  
- Transaction status checking
- Wallet balance fetching
- Multi-chain support (ERC20, BEP20, TRC20, POLYGON, SOLANA)  
- Webhook notifications (IPN)  
- Custom UDF field support  
- Rate limiting protection  
- Zero transaction fees
- Non-custodial architecture
- Enterprise-grade security

## API Reference

### Create Deposit
```javascript
await client.createDeposit({
    networkType: 'BEP20',
    contractAddress: '0',    // Use '0' for mainnet tokens
    amount: '1.5',
    ipnUrl: 'https://callback.com/ipn',
    udf: 'order-123',       // Optional
    type: 'TEMPORARY'       // Optional: TEMPORARY or PERMANENT
});
```
**Response:**
```json
{
    "id": "deposit-id",
    "address": "crypto-address",
    "expiresAt": "2024-01-09T12:00:00Z",
    "amount": "1.5",
    "status": "PENDING"
}
```

### Create Withdrawal
Withdrawals need an API key created with **Withdrawals** turned on, which requires two-factor authentication on your account.

```javascript
await client.createWithdrawal({
    networkType: 'ERC20',
    contractAddress: '0',    // Use '0' for mainnet tokens
    address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    amount: '0.5',
    ipnUrl: 'https://callback.com/ipn',
    udf: 'withdrawal-123'    // Optional
}, {
    idempotencyKey: 'payout-123' // Optional, recommended
});
```

Pass an `idempotencyKey` (1-128 letters, digits, `-` or `_`) so that a retry after a timeout or network error cannot send the money twice. For 24 hours, a repeat with the same key returns the first withdrawal instead of creating another; while the first request is still running, a repeat fails with 409. Use one key per payout, such as your own payout id.
**Response:**
```json
{
    "id": "withdrawal-id",
    "status": "PENDING",
    "fee": "0.001"
}
```

### Check Transaction Status
```javascript
// By address
await client.checkTransactionStatus('deposit', { address: '0x123abc...' });

// By transaction ID
await client.checkTransactionStatus('deposit', { id: 'deposit-uuid' });
```
**Response:**
```json
{
  "address": "0x123abc...",
  "transactionType": "deposit",
  "count": 1,
  "transactions": [
    {
      "id": "tx-uuid-1",
      "transactionType": "deposit",
      "status": "COMPLETED",
      "amount": "10.5",
      "createdAt": "2025-03-16T12:00:00Z",
      "updatedAt": "2025-03-16T12:15:00Z",
      "txHash": "0xf7e...",
      "networkType": "ERC20",
      "contractAddress": "0x...",
      "address": "0x123abc...",
      "udf": "order-123",
      "token": {
        "networkType": "ERC20",
        "contractAddress": "0x...",
        "symbol": "USDT",
        "name": "Tether USD",
        "decimals": 6
      }
    }
  ]
}
```

### Fetch Wallet Balance
```javascript
await client.fetchWalletBalance('0x456def...', 'ERC20', '0x...');
```
**Response:**
```json
{
  "address": "0x456def...",
  "networkType": "ERC20",
  "contractAddress": "0x...",
  "token": {
    "symbol": "USDT",
    "name": "Tether USD",
    "decimals": 6
  },
  "balance": {
    "raw": "10500000",
    "formatted": "10.5"
  }
}
```

### Verify IPN
Confirms with the SagaPay API that an IPN notification you received is genuine. Your API credentials are sent in the request body automatically — no auth headers are used on this endpoint.
```javascript
await client.verifyIpn({
    txnHash: '0xabc123...',
    type: 'DEPOSIT',         // 'DEPOSIT' | 'WITHDRAWAL' (uppercase)
    amount: '10.5',
    address: '0x123abc...'
});
```
**Response:**
```json
{
    "verified": true
}
```

## Webhook Notifications
Sagapay uses webhooks (IPN) to notify your application when events happen in your account. Each webhook notification contains information about the triggering event and transaction. Delivery is **at-least-once** — the same notification may be delivered more than once, so make your handler idempotent.

### Webhook Payload Structure
When Sagapay sends a webhook to your endpoint, it will include the following payload:

```json
{
  "id": "transaction-uuid",
  "type": "DEPOSIT|WITHDRAWAL",
  "status": "COMPLETED",
  "address": "0x123abc...",
  "networkType": "ERC20|BEP20|TRC20|POLYGON|SOLANA",
  "asset": "USDT",
  "contractAddress": "0x55d398326f99059fF775485246999027B3197955",
  "amount": "10.5",
  "udf": "your-optional-user-defined-field",
  "txHash": "0xabc123...",
  "timestamp": "2025-03-16T14:30:00Z"
}
```

Notes:
- `type` is UPPERCASE: `DEPOSIT` or `WITHDRAWAL`.
- `status` is currently always `COMPLETED` — notifications are sent when a transaction completes.
- `asset` and `contractAddress` say what was received. `contractAddress` is `null` for the chain's native coin. Always check them: `networkType` alone does not tell 100 TRX from 100 USDT.
- `udf` and `txHash` may be `null`.
- `timestamp` is set when the transaction completes and does not change on retries.

### Verifying Webhooks
Every webhook carries a signature over the exact raw request body:

```
X-Sagapay-Merchant-Signature: sha256=<hex HMAC-SHA256 of the raw body>
```

It is keyed with your **signing secret**. Copy it from the dashboard: **Webhooks → Signing secret**. It is not your API secret, and nobody else's secret can produce a valid signature for your notifications.

Check the signature before you act on anything in the body:

```javascript
import { SagaPayClient, verifyIpnSignature, isIpnFresh, parseIpnPayload } from 'sagapay-sdk';

// Example with Express — the signature is over the raw body, so do not let a
// JSON parser run first.
app.post('/ipn', express.raw({ type: 'application/json' }), async (req, res) => {
    const valid = verifyIpnSignature(
        req.body,                                    // exact raw body (Buffer or string)
        req.headers['x-sagapay-merchant-signature'], // "sha256=<hex>"
        process.env.SAGAPAY_SIGNING_SECRET           // Webhooks → Signing secret
    );
    if (!valid) {
        return res.status(401).send('Invalid signature');
    }

    const payload = parseIpnPayload(req.body);

    // Optional: refuse notifications older than 24 hours (the default).
    if (!isIpnFresh(payload)) {
        return res.status(400).send('Stale notification');
    }

    // Process each id once. Delivery is at-least-once, and a replayed request
    // carries a valid signature too.
    const firstTime = await markProcessed(payload.id); // e.g. INSERT ... ON CONFLICT DO NOTHING
    if (firstTime) {
        await fulfil(payload);
    }
    res.status(200).send('OK');
});
```

The old `X-Sagapay-Signature` header was keyed with a secret shared by every merchant. It is retired: SagaPay no longer sends it, and this SDK no longer accepts it. Verify `X-Sagapay-Merchant-Signature` only.

You can also confirm a transaction with the SagaPay API. This is a network round trip, so use it as an extra check rather than instead of the signature:

```javascript
const { verified } = await client.verifyIpn({
    txnHash: payload.txHash,
    type: payload.type,       // 'DEPOSIT' | 'WITHDRAWAL'
    amount: payload.amount,
    address: payload.address
});
```

### Replay protection
A captured webhook still has a valid signature, so the signature alone does not stop someone resending it. Protect against that:
- **Process each `id` once.** Record the ids you have handled (a unique column works) and acknowledge duplicates with a 200 without acting on them again. This is the main defence and also covers normal retries.
- **Optionally check the age** with `isIpnFresh(payload, maxAgeSeconds)`. Keep the limit above the retry schedule (about 7.5 hours): retries reuse the original `timestamp`. A notification you resend from the dashboard also keeps it, so a resend older than your limit will be refused.
- **Check what you are crediting.** Match `asset`, `contractAddress`, `amount` and `address` against the order before you fulfil it.

### Best Practices for Handling Webhooks
- Verify `X-Sagapay-Merchant-Signature` on every notification before trusting it
- Keep your signing secret on the server, out of source control and client code
- Implement idempotency on `id` to handle duplicates and replays (delivery is at-least-once)
- Return a 2xx status code within 20 seconds to acknowledge receipt
- Process webhook data asynchronously if business logic is complex
- Store webhook data for reconciliation and debugging purposes

## Error Handling
```javascript
try {
    await client.createDeposit(params);
} catch (error) {
    console.error(error.message);
}
```
**Error Response:**
```json
{
    "error": "Invalid amount format"
}
```
The `error` field carries the human-readable reason. The SDK surfaces it as the thrown `Error`'s message (401 → `Invalid API credentials`, 429 → `Rate limit exceeded`).

### Mainnet Tokens (Use '0')
- BNB (BEP20)
- ETH (ERC20)
- MATIC (POLYGON)
- TRX (TRC20)
- SOL (SOLANA)

### Token Contracts (example)
- USDT BEP20: `0x55d398326f99059fF775485246999027B3197955`
- USDT ERC20: `0xdAC17F958D2ee523a2206206994597C13D831ec7`
- USDT POLYGON: `0xc2132D05D31c914a87C6611C10748AEb04B58e8F`
- USDT TRC20: `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`
- USDT SOLANA: `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`

### Transaction States
- `PENDING`
- `PROCESSING`
- `COMPLETED`
- `FAILED`
- `CANCELLED`

### Rate Limits
- `/create-deposit`: 60 requests per minute
- `/create-withdrawal`: 60 requests per minute
- `/check-transaction-status`: 60 requests per minute
- `/fetch-wallet-balance`: 100 requests per minute
- **IPN delivery:** up to 6 attempts (retries after 1 min, 5 min, 15 min, 1 h and 6 h)
- **Request timeout:** 30 seconds

### Types
```typescript
type NetworkType = 'ERC20' | 'BEP20' | 'TRC20' | 'POLYGON' | 'SOLANA';
type TransactionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
type AddressType = 'TEMPORARY' | 'PERMANENT';
type TransactionType = 'deposit' | 'withdrawal';

interface Token {
    networkType: NetworkType;
    contractAddress: string;
    symbol: string;
    name: string;
    decimals: number;
}

interface Balance {
    raw: string;
    formatted: string;
}
```