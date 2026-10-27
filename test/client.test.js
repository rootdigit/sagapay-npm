const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const { SagaPayClient } = require('../dist/index.js');

// A local stand-in for the API: records each request, then answers with
// whatever `respond` does.
async function withServer(respond, fn) {
    const seen = [];
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
            seen.push({ url: req.url, headers: req.headers, body });
            respond(req, res);
        });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
        await fn(`http://127.0.0.1:${server.address().port}`, seen);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

const WITHDRAWAL = {
    networkType: 'BEP20',
    contractAddress: '0',
    address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    amount: '0.5',
    ipnUrl: 'https://example.com/ipn',
};

const created = (req, res) => {
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'w-1', status: 'PENDING', fee: '0' }));
};

test('createWithdrawal sends the Idempotency-Key header when given', async () => {
    await withServer(created, async (baseURL, seen) => {
        const client = new SagaPayClient('key', 'secret', baseURL);
        const result = await client.createWithdrawal(WITHDRAWAL, { idempotencyKey: 'payout-123' });
        assert.strictEqual(result.id, 'w-1');
        assert.strictEqual(seen[0].headers['idempotency-key'], 'payout-123');
        assert.strictEqual(seen[0].headers['x-api-key'], 'key');
    });
});

test('createWithdrawal sends no Idempotency-Key header by default', async () => {
    await withServer(created, async (baseURL, seen) => {
        const client = new SagaPayClient('key', 'secret', baseURL);
        await client.createWithdrawal(WITHDRAWAL);
        assert.strictEqual(seen[0].headers['idempotency-key'], undefined);
    });
});

test('requests do not follow redirects, so credentials stay on the API host', async () => {
    const redirect = (req, res) => {
        if (req.url === '/create-withdrawal') {
            res.writeHead(307, { Location: '/elsewhere' });
            res.end();
        } else {
            created(req, res);
        }
    };
    await withServer(redirect, async (baseURL, seen) => {
        const client = new SagaPayClient('key', 'secret', baseURL);
        await assert.rejects(client.createWithdrawal(WITHDRAWAL));
        assert.deepStrictEqual(seen.map((r) => r.url), ['/create-withdrawal']);
    });
});
