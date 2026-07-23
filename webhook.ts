import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { IpnPayload } from './types';

/**
 * Verifies the `X-Sagapay-Signature` header of an incoming IPN webhook.
 *
 * Signature verification is OPTIONAL and requires the platform-issued IPN secret
 * (NOT your merchant apiSecret). The primary way to verify an IPN is to call
 * `client.verifyIpn()` against the SagaPay API.
 *
 * The header value is `sha256=<hex>` where `<hex>` is the HMAC-SHA256 of the
 * exact raw request body, keyed with the platform IPN secret.
 *
 * @param rawBody         The exact raw request body, unmodified (string or Buffer).
 * @param signatureHeader Value of the `X-Sagapay-Signature` header (the leading `sha256=` prefix is optional).
 * @param ipnSecret       The platform-issued IPN secret (NOT the merchant apiSecret).
 * @returns true if the signature matches; false for missing/empty inputs or a mismatch (never throws).
 */
export function verifyIpnSignature(rawBody: string | Buffer, signatureHeader: string, ipnSecret: string): boolean {
    if (!rawBody || rawBody.length === 0 || !signatureHeader || !ipnSecret) {
        return false;
    }
    const signature = signatureHeader.startsWith('sha256=')
        ? signatureHeader.slice('sha256='.length)
        : signatureHeader;
    if (!signature) {
        return false;
    }
    const expected = createHmac('sha256', ipnSecret).update(rawBody).digest('hex');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const signatureBuffer = Buffer.from(signature, 'utf8');
    if (expectedBuffer.length !== signatureBuffer.length) {
        return false;
    }
    return timingSafeEqual(expectedBuffer, signatureBuffer);
}

/**
 * Parses a raw IPN webhook body into a typed {@link IpnPayload}.
 *
 * Note: parsing alone does not authenticate the notification. Verify it with
 * `client.verifyIpn()` (the primary check), and optionally with
 * `verifyIpnSignature()` if you have the platform-issued IPN secret
 * (NOT the merchant apiSecret).
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
