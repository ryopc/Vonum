/**
 * Verify an Ed25519 signature.
 * @param payload The original payload object that was signed.
 * @param sig Base64url-encoded signature.
 * @param pubkey Public key as Uint8Array.
 * @returns True if signature is valid.
 */
export async function verifySignature(payload: unknown, sig: string, pubkey: Uint8Array): Promise<boolean> {
  if (!sig) return false;
  try {
    // Convert base64url to base64
    const sigB64 = sig.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (sigB64.length % 4)) % 4);
    const sigB64Padded = sigB64 + padding;
    // Decode to bytes
    const sigBytes = Uint8Array.from(atob(sigB64Padded), c => c.charCodeAt(0));

    // Import public key as Ed25519
    const pubKey = await crypto.subtle.importKey(
      "raw",
      pubkey,
      { name: "Ed25519" },
      false,
      ["verify"]
    );

    const data = new TextEncoder().encode(JSON.stringify(payload));
    return await crypto.subtle.verify(
      { name: "Ed25519" },
      pubKey,
      sigBytes,
      data
    );
  } catch (e) {
    console.error('Signature verification error:', e);
    return false;
  }
}
