import { verifySignature } from '../src/lib/verifySignature';

describe('verifySignature', () => {
  it('returns false for empty signature', async () => {
    const ok = await verifySignature({ test: 1 }, '', new Uint8Array([1,2,3]));
    expect(ok).toBe(false);
  });

  it('returns false for malformed signature', async () => {
    const ok = await verifySignature({ test: 1 }, '!!', new Uint8Array([1,2,3]));
    expect(ok).toBe(false);
  });

  it('verifies a valid Ed25519 signature', async () => {
    // Generate a key pair
    const { privateKey, publicKey } = await crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify']
    );

    // Export public key as raw bytes
    const pubKeyRaw = await crypto.subtle.exportKey('raw', publicKey);
    const pubKeyBytes = new Uint8Array(pubKeyRaw);

    const payload = { number: '12345', publicKey: 'test' };
    const payloadStr = JSON.stringify(payload);
    const data = new TextEncoder().encode(payloadStr);

    // Sign the payload
    const signature = await crypto.subtle.sign(
      { name: 'Ed25519' },
      privateKey,
      data
    );
    const sigBytes = new Uint8Array(signature);

    // Convert to base64url (as used in the protocol)
    let sigBase64 = btoa(String.fromCharCode(...sigBytes));
    sigBase64 = sigBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

    const ok = await verifySignature(payload, sigBase64, pubKeyBytes);
    expect(ok).toBe(true);
  });

  it('rejects a wrong signature', async () => {
    const { privateKey, publicKey } = await crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify']
    );
    const { privateKey: privateKey2 } = await crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign']
    );

    const pubKeyRaw = await crypto.subtle.exportKey('raw', publicKey);
    const pubKeyBytes = new Uint8Array(pubKeyRaw);

    const payload = { number: '12345' };
    const payloadStr = JSON.stringify(payload);
    const data = new TextEncoder().encode(payloadStr);

    // Sign with wrong key
    const signature = await crypto.subtle.sign(
      { name: 'Ed25519' },
      privateKey2,
      data
    );
    const sigBytes = new Uint8Array(signature);
    let sigBase64 = btoa(String.fromCharCode(...sigBytes));
    sigBase64 = sigBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

    const ok = await verifySignature(payload, sigBase64, pubKeyBytes);
    expect(ok).toBe(false);
  });
});
