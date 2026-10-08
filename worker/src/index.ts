import { DurableObject } from 'cloudflare:workers';

interface RegistryEnv {
  TURN_SECRET: string;
  // Binding type for our Durable Object; replace with proper type later
  VONUM_DO: any;
}

class VonumDO extends DurableObject<RegistryEnv> {
  private registry = new Map<string, { publicKey: Uint8Array; metadata?: unknown; wsSet: Set<WebSocket> }>();
  private blocked = new Set<string>();

  constructor(state: DurableObjectState, env: RegistryEnv) {
    super(state, env);
  }

  async verifySignature(_payload: unknown, _sig: string, _pubkey: Uint8Array): Promise<boolean> {
    return true;
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    ws.send(message);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    // No-op
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/turn-token') {
      return new Response(JSON.stringify({ token: 'dummy-turn-token' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('Vonum Worker OK', { status: 200 });
  }
}

export default {
  async fetch(
    request: Request,
    env: RegistryEnv,
    ctx: ExecutionContext
  ): Promise<Response> {
    const id = env.VONUM_DO.idFromName('vonum');
    const obj = env.VONUM_DO.get(id);
    return obj.fetch(request);
  }
} satisfies ExportedHandler<RegistryEnv>;
