# SagaPay SDK

## SagaPay: Blockchain Payment Processing Simplified

SagaPay (https://sagapay.io) is the world's first free, non-custodial blockchain payment gateway service provider, enabling businesses to seamlessly integrate cryptocurrency payments without holding customer funds. With enterprise-grade security and zero transaction fees, SagaPay empowers merchants to accept crypto payments across multiple blockchains while maintaining full control of their digital assets.

## Installation
```bash
npm install sagapay
```

## Initialization
```javascript
import { SagaPayClient } from 'sagapay';

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
```javascript
await client.createWithdrawal({
    networkType: 'ERC20',
    contractAddress: '0',    // Use '0' for mainnet tokens
    address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    amount: '0.5',
    ipnUrl: 'https://callback.com/ipn',
    udf: 'withdrawal-123'    // Optional
});
```
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
  "amount": "10.5",
  "udf": "your-optional-user-defined-field",
  "txHash": "0xabc123...",
  "timestamp": "2025-03-16T14:30:00Z"
}
```

Notes:
- `type` is UPPERCASE: `DEPOSIT` or `WITHDRAWAL`.
- `status` is currently always `COMPLETED` — notifications are sent when a transaction completes.
- `udf` and `txHash` may be `null`.

Each webhook request also carries a signature header over the exact raw request body:

```
X-Sagapay-Signature: sha256=<hex HMAC-SHA256 of the raw body>
```

The signature is keyed with a **platform-issued IPN secret** — NOT your merchant `apiSecret`.

### Verifying Webhooks
The primary verification is `client.verifyIpn()`, which asks the SagaPay API to confirm the transaction:

```javascript
import { SagaPayClient, parseIpnPayload } from 'sagapay';

const client = new SagaPayClient('your-api-key', 'your-api-secret');

// Example with Express — use the raw body for webhooks
app.post('/ipn', express.raw({ type: 'application/json' }), async (req, res) => {
    const payload = parseIpnPayload(req.body);

    const { verified } = await client.verifyIpn({
        txnHash: payload.txHash,
        type: payload.type,       // 'DEPOSIT' | 'WITHDRAWAL'
        amount: payload.amount,
        address: payload.address
    });

    if (!verified) {
        return res.status(400).send('Invalid IPN');
    }

    // Process the notification (idempotently — delivery is at-least-once)
    res.status(200).send('OK');
});
```

Optionally, if you have your platform-issued IPN secret, you can additionally verify the signature header locally:

```javascript
import { verifyIpnSignature } from 'sagapay';

const valid = verifyIpnSignature(
    req.body,                           // exact raw request body (string or Buffer)
    req.headers['x-sagapay-signature'], // "sha256=<hex>"
    process.env.SAGAPAY_IPN_SECRET      // platform IPN secret, NOT your apiSecret
);
```

### Best Practices for Handling Webhooks
- Verify every notification with `client.verifyIpn()` before trusting it
- Implement idempotency to handle duplicate webhook notifications (delivery is at-least-once)
- Return a 200 status code promptly to acknowledge receipt
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
- **IPN retries:** 10 attempts max
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