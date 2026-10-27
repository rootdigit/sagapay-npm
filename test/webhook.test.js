const test = require('node:test');
const assert = require('node:assert');
const { createHmac } = require('node:crypto');

const { verifyIpnSignature, isIpnFresh, parseIpnPayload, SagaPayClient, SIGNATURE_HEADER } = require('../dist/index.js');

// A merchant signing secret is a 64-character hex string, used as the HMAC key
// exactly as written.
const IPN_SECRET = 'a3f1c2e4b5d697881234567890abcdef00112233445566778899aabbccddeeff';

const PAYLOAD = {
    id: '8f2c1b6e-3d5a-4c7b-9e1f-2a3b4c5d6e7f',
    type: 'DEPOSIT',
    status: 'COMPLETED',
    address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    networkType: 'BEP20',
    asset: 'USDT',
    contractAddress: '0x55d398326f99059fF775485246999027B3197955',
    amount: '100.5',
    udf: 'order-123',
    txHash: '0xabc123',
    timestamp: '2026-07-24T00:00:00.000Z',
};

const body = JSON.stringify(PAYLOAD);

// Mirrors how SagaPay signs X-Sagapay-Merchant-Signature.
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
    assert.strictEqual(verifyIpnSignature(body, undefined, IPN_SECRET), false);
    assert.strictEqual(verifyIpnSignature(body, sign(body), ''), false);
});

test('verifyIpnSignature accepts upper-case hex', () => {
    const upper = 'sha256=' + sign(body).slice('sha256='.length).toUpperCase();
    assert.strictEqual(verifyIpnSignature(body, upper, IPN_SECRET), true);
});

test('verifyIpnSignature rejects malformed and truncated signatures', () => {
    const hex = sign(body).slice('sha256='.length);
    assert.strictEqual(verifyIpnSignature(body, 'sha256=' + hex.slice(0, 62), IPN_SECRET), false);
    assert.strictEqual(verifyIpnSignature(body, 'sha256=' + hex + '00', IPN_SECRET), false);
    assert.strictEqual(verifyIpnSignature(body, 'sha256=' + 'zz' + hex.slice(2), IPN_SECRET), false);
    assert.strictEqual(verifyIpnSignature(body, 'sha256=', IPN_SECRET), false);
});

test('verifyIpnSignature rejects a repeated header', () => {
    assert.strictEqual(verifyIpnSignature(body, [sign(body), sign(body)], IPN_SECRET), false);
});

test('SIGNATURE_HEADER names the merchant signature header', () => {
    assert.strictEqual(SIGNATURE_HEADER, 'X-Sagapay-Merchant-Signature');
});

test('isIpnFresh accepts a recent timestamp and rejects an old one', () => {
    const sent = Date.parse(PAYLOAD.timestamp);
    assert.strictEqual(isIpnFresh(PAYLOAD, 3600, sent + 60_000), true);
    assert.strictEqual(isIpnFresh(PAYLOAD, 3600, sent + 3601_000), false);
    // Default: 24 hours, which outlasts the ~7.5 hour retry schedule.
    assert.strictEqual(isIpnFresh(PAYLOAD, undefined, sent + 8 * 3600_000), true);
    assert.strictEqual(isIpnFresh(PAYLOAD, undefined, sent + 25 * 3600_000), false);
});

test('isIpnFresh rejects a far-future or missing timestamp', () => {
    const sent = Date.parse(PAYLOAD.timestamp);
    assert.strictEqual(isIpnFresh(PAYLOAD, 3600, sent - 10 * 60_000), false);
    assert.strictEqual(isIpnFresh(PAYLOAD, 3600, sent - 60_000), true);
    assert.strictEqual(isIpnFresh({ timestamp: 'not a date' }), false);
    assert.strictEqual(isIpnFresh({}), false);
});

test('parseIpnPayload round-trips the documented payload', () => {
    const parsed = parseIpnPayload(body);
    assert.strictEqual(parsed.id, PAYLOAD.id);
    assert.strictEqual(parsed.type, 'DEPOSIT');
    assert.strictEqual(parsed.status, 'COMPLETED');
    assert.strictEqual(parsed.amount, '100.5');
    assert.strictEqual(parsed.txHash, '0xabc123');
    assert.strictEqual(parsed.asset, 'USDT');
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

// Produced by the SagaPay signer (core-api utils/ipnSignature.js) for a test
// merchant; keeps this SDK in step with what the platform actually sends.
test('verifyIpnSignature accepts a signature made by the SagaPay signer', () => {
    const secret = 'f59949bf79a73e05a41f10d2333a41b80644430f5220f468171392df355663a7';
    const raw = '{"id":"dep-1","type":"DEPOSIT","status":"COMPLETED","address":"0xabc","networkType":"BEP20","asset":"USDT","contractAddress":"0x55d398326f99059fF775485246999027B3197955","amount":"100.5","udf":null,"txHash":"0xdef","timestamp":"2026-10-27T00:00:00.000Z"}';
    const header = 'sha256=a9841956a4b8ccf048f953081db6892e69da181b5792dfcf8604ea4795f6a469';
    assert.strictEqual(verifyIpnSignature(raw, header, secret), true);
    assert.strictEqual(verifyIpnSignature(raw.replace('100.5', '100.6'), header, secret), false);
});
