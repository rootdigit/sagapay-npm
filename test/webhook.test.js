const test = require('node:test');
const assert = require('node:assert');
const { createHmac } = require('node:crypto');

const { verifyIpnSignature, parseIpnPayload, SagaPayClient } = require('../dist/index.js');

const IPN_SECRET = 'platform-issued-ipn-secret';

const PAYLOAD = {
    id: '8f2c1b6e-3d5a-4c7b-9e1f-2a3b4c5d6e7f',
    type: 'DEPOSIT',
    status: 'COMPLETED',
    address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    networkType: 'BEP20',
    amount: '100.5',
    udf: 'order-123',
    txHash: '0xabc123',
    timestamp: '2026-07-24T00:00:00.000Z',
};

const body = JSON.stringify(PAYLOAD);

// Mirrors how the platform signs outbound IPNs.
function sign(payload, secret = IPN_SECRET) {
    return 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
}

test('verifyIpnSignature accepts a signature with the sha256= prefix', () => {
    assert.strictEqual(verifyIpnSignature(body, sign(body), IPN_SECRET), true);
});

test('verifyIpnSignature accepts a bare hex digest', () => {
    const bare = sign(body).slice('sha256='.length);
    assert.strictEqual(verifyIpnSignature(body, bare, IPN_SECRET), true);
});

test('verifyIpnSignature accepts a Buffer body', () => {
    const raw = Buffer.from(body, 'utf8');
    assert.strictEqual(verifyIpnSignature(raw, sign(body), IPN_SECRET), true);
});

test('verifyIpnSignature rejects a tampered body', () => {
    const tampered = body.replace('100.5', '999999.0');
    assert.strictEqual(verifyIpnSignature(tampered, sign(body), IPN_SECRET), false);
});

test('verifyIpnSignature rejects a signature made with a different secret', () => {
    assert.strictEqual(verifyIpnSignature(body, sign(body, 'wrong-secret'), IPN_SECRET), false);
});

test('verifyIpnSignature returns false rather than throwing on empty input', () => {
    assert.strictEqual(verifyIpnSignature('', sign(body), IPN_SECRET), false);
    assert.strictEqual(verifyIpnSignature(body, '', IPN_SECRET), false);
    assert.strictEqual(verifyIpnSignature(body, sign(body), ''), false);
});

test('parseIpnPayload round-trips the documented payload', () => {
    const parsed = parseIpnPayload(body);
    assert.strictEqual(parsed.id, PAYLOAD.id);
    assert.strictEqual(parsed.type, 'DEPOSIT');
    assert.strictEqual(parsed.status, 'COMPLETED');
    assert.strictEqual(parsed.amount, '100.5');
    assert.strictEqual(parsed.txHash, '0xabc123');
});

test('parseIpnPayload accepts a Buffer and handles a null udf/txHash', () => {
    const raw = Buffer.from(JSON.stringify({ ...PAYLOAD, type: 'WITHDRAWAL', udf: null, txHash: null }));
    const parsed = parseIpnPayload(raw);
    assert.strictEqual(parsed.type, 'WITHDRAWAL');
    assert.strictEqual(parsed.udf, null);
    assert.strictEqual(parsed.txHash, null);
});

test('parseIpnPayload throws a clear error on invalid JSON', () => {
    assert.throws(() => parseIpnPayload('not json'), /not valid JSON/);
});

test('client exposes the documented methods', () => {
    const client = new SagaPayClient('api-key', 'api-secret');
    for (const method of ['createDeposit', 'createWithdrawal', 'checkTransactionStatus', 'fetchWalletBalance', 'verifyIpn']) {
        assert.strictEqual(typeof client[method], 'function', `${method} should be a function`);
    }
});
