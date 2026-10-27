import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { IpnPayload } from './types';

/**
 * The header that carries an IPN's signature. Node lowercases incoming header
 * names, so read it as `req.headers['x-sagapay-merchant-signature']`.
 */
export const SIGNATURE_HEADER = 'X-Sagapay-Merchant-Signature';

/** Default for {@link isIpnFresh}: 24 hours. */
export const DEFAULT_IPN_MAX_AGE_SECONDS = 24 * 60 * 60;

// How far ahead of this machine's clock a timestamp may be before it is
// treated as invalid rather than as clock drift.
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const HEX_SHA256 = /^[0-9a-f]{64}$/i;

/**
 * Verifies the `X-Sagapay-Merchant-Signature` header of an incoming IPN webhook.
 *
 * The header value is `sha256=<hex>`, where `<hex>` is the HMAC-SHA256 of the
 * exact raw request body keyed with your signing secret. Copy the secret from
 * the dashboard: Webhooks → Signing secret. It is NOT your API secret.
 *
 * Only this header is checked. The old platform-wide `X-Sagapay-Signature`
 * header is retired and no longer accepted.
 *
 * @param rawBody         The exact raw request body, unmodified (string or Buffer).
 * @param signatureHeader Value of the `X-Sagapay-Merchant-Signature` header (the leading `sha256=` prefix is optional).
 * @param signingSecret   Your signing secret from the dashboard's Webhooks page.
 * @returns true if the signature matches; false for missing/malformed inputs or a mismatch (never throws).
 */
export function verifyIpnSignature(
    rawBody: string | Buffer,
    signatureHeader: string | string[] | null | undefined,
    signingSecret: string
): boolean {
    // A repeated header arrives as an array; never guess which one to trust.
    if (!rawBody || rawBody.length === 0 || typeof signatureHeader !== 'string' || !signingSecret) {
        return false;
    }
    const signature = signatureHeader.trim().replace(/^sha256=/i, '');
    if (!HEX_SHA256.test(signature)) {
        return false;
    }
    const expected = createHmac('sha256', signingSecret).update(rawBody).digest();
    return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

/**
 * Whether an IPN's `timestamp` is recent enough to act on, as a guard against
 * an old, validly signed notification being replayed.
 *
 * The timestamp is set when the transaction completes and stays the same on
 * every retry, so keep `maxAgeSeconds` longer than the retry schedule (about
 * 7.5 hours). A notification you resend from the dashboard also keeps its
 * original timestamp, and is rejected here once it is older than the limit.
 *
 * This is a secondary check. The main defence against replays is to process
 * each notification `id` only once.
 *
 * @param payload       The parsed IPN payload (only `timestamp` is read).
 * @param maxAgeSeconds Oldest age to accept. Defaults to 24 hours.
 * @param now           The current time in milliseconds, for tests.
 * @returns false for a missing or unparseable timestamp, one older than `maxAgeSeconds`, or one more than 5 minutes in the future.
 */
export function isIpnFresh(
    payload: Pick<IpnPayload, 'timestamp'>,
    maxAgeSeconds: number = DEFAULT_IPN_MAX_AGE_SECONDS,
    now: number = Date.now()
): boolean {
    const sent = Date.parse(payload?.timestamp ?? '');
    if (Number.isNaN(sent)) {
        return false;
    }
    return sent <= now + MAX_CLOCK_SKEW_MS && now - sent <= maxAgeSeconds * 1000;
}

/**
 * Parses a raw IPN webhook body into a typed {@link IpnPayload}.
 *
 * Note: parsing alone does not authenticate the notification. Check
 * `verifyIpnSignature()` first, with your signing secret from the dashboard's
 * Webhooks page, and only then parse and act on the body.
 *
 * @param rawBody The raw request body (string or Buffer).
 * @returns The parsed IPN payload.
 * @throws Error if the body is not valid JSON.
 */
export function parseIpnPayload(rawBody: string | Buffer): IpnPayload {
    const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
    try {
        return JSON.parse(body) as IpnPayload;
    } catch {
        throw new Error('Invalid IPN payload: request body is not valid JSON');
    }
}
