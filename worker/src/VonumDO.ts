import { DurableObject } from 'cloudflare:workers';

export class VonumDO extends DurableObject {
  constructor(state: DurableObjectState, env: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) {
    super(state, env);
  }

  async register(number: string, publicKey: Uint8Array, metadata?: unknown): Promise<void> {
    const storage = this.ctx.storage;
    const key = `number:${number}`;
    const publicKeyBase64 = btoa(String.fromCharCode(...publicKey));
    await storage.put(key, {
      publicKey: publicKeyBase64,
      metadata,
    });
  }

  async get(kid: string): Promise<{publicKey: Uint8Array; metadata?: unknown} | null> {
    const storage = this.ctx.storage;
    const key = `number:${kid}`;
    const value = await storage.get<{publicKey: string; metadata?: unknown}>(key);
    if (!value) {
      return null;
    }
    const binary = atob(value.publicKey);
    const publicKeyBuf = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      publicKeyBuf[i] = binary.charCodeAt(i);
    }
    return {
      publicKey: publicKeyBuf,
      metadata: value.metadata,
    };
  }

  // Handle /turn-token endpoint
  async fetch(request: Request /* eslint-disable-line @typescript-eslint/no-unused-vars */): Promise<Response> {
    const turnSecret = this.env.TURN_SECRET;
    if (!turnSecret) {
      return new Response('TURN_SECRET not configured', { status: 500 });
    }
    return new Response(JSON.stringify({ secret: turnSecret }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
