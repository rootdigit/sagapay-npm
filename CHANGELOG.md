# Changelog

## 4.5.0 — 2026-10-27

### Security
- Webhooks are verified with `X-Sagapay-Merchant-Signature`, keyed with your own signing secret (dashboard: Webhooks → Signing secret). The old `X-Sagapay-Signature` header, keyed with a secret shared by every merchant, is retired: SagaPay no longer sends it and the docs no longer describe it.
- `verifyIpnSignature()` now compares the decoded digest, accepts upper-case hex, and returns `false` for a malformed digest or a repeated header (an array) instead of comparing it.
- Requests no longer follow redirects, so your `x-api-key` and `x-api-secret` headers are never resent to another host.
- axios is now `^1.21.0` and follow-redirects `^1.16.2`, which fix advisories GHSA-r4gj-5m52-g5wh, GHSA-q3jh-wrc6-jgq8 and GHSA-8r9p-f939-6h3c.

### Added
- `isIpnFresh(payload, maxAgeSeconds?)` rejects notifications whose `timestamp` is older than the limit (default 24 hours) or more than 5 minutes in the future. Use it alongside processing each `id` only once.
- `SIGNATURE_HEADER` constant.
- `createWithdrawal(data, { idempotencyKey })` sends an `Idempotency-Key` header, so a retried request cannot create a second withdrawal.
- `IpnPayload` has the `asset` and `contractAddress` fields that notifications carry.

### Fixed
- Requests time out after 30 seconds, as the README already said.
- The README now gives the real IPN retry schedule: 6 attempts.
