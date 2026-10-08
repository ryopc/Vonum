import { VonumDO } from './VonumDO';

import { verifySignature } from './lib/verifySignature';

export { VonumDO, verifySignature };

// Global maps to store active connections (shared across all WebSocket upgrades)
const connections = new Map<string, WebSocket>(); // number -> WebSocket
const reverse = new Map<WebSocket, string>(); // WebSocket -> number

/* eslint-disable @typescript-eslint/no-unused-vars */
// Payload interfaces (not exported, just for clarity)
interface RegisterPayload {
  number: string;
  publicKey: string; // base64url
  metadata?: unknown;
}
interface ResolvePayload {
  number: string;
}
interface OfferPayload {
  sdp: string;
  fingerprint: string;
  target?: string; // target number
}
interface AnswerPayload {
  sdp: string;
  fingerprint: string;
  target?: string;
}
interface IceCandidatePayload {
  candidate: string;
  sdpMid: string;
  sdpMLineIndex: number;
  target?: string;
}
interface HangupPayload {
  reason?: string;
  target?: string;
}
/* eslint-enable @typescript-eslint/no-unused-vars */

// Helper to convert base64url to standard base64
function base64UrlToBase64(str: string): string {
  return str.replace(/-/g, '+').replace(/_/g, '/');
}

export default {
  async fetch(
    request: Request,
    env: RegistryEnv,
    _ctx: ExecutionContext // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<Response> {
    const url = new URL(request.url);
    // Handle WebSocket upgrade
    if (request.headers.get('upgrade') === 'websocket') {
      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);

      // Accept the WebSocket connection
      server.accept();

      // Handle messages from the client
      server.addEventListener('message', async (event) => {
        if (typeof event.data !== 'string') {
          server.close(1003, 'Only text messages supported');
          return;
        }
        let data: {
          type: string;
          payload: unknown;
          sig: string;
          kid: string;
        };
        try {
          data = JSON.parse(event.data);
        } catch {
          server.close(1003, 'Invalid JSON');
          return;
        }
        const { type, payload, sig, kid } = data;

        // Handle register separately
        if (type === 'register') {
          const registerPayload = payload as RegisterPayload;
          if (!registerPayload || typeof registerPayload.number !== 'string' || typeof registerPayload.publicKey !== 'string') {
            server.send(JSON.stringify({ type: 'register-result', payload: { ok: false, error: 'Invalid register payload' }, sig: '', kid: '' }));
            server.close(1003, 'Invalid register payload');
            return;
          }
          // Decode public key from base64url
          let publicKeyBuf: Uint8Array;
          try {
            const b64 = base64UrlToBase64(registerPayload.publicKey);
            const padding = '='.repeat((4 - (b64.length % 4)) % 4);
            const b64Padded = b64 + padding;
            const binary = atob(b64Padded);
            publicKeyBuf = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              publicKeyBuf[i] = binary.charCodeAt(i);
            }
          } catch {
            server.send(JSON.stringify({ type: 'register-result', payload: { ok: false, error: 'Invalid public key encoding' }, sig: '', kid: '' }));
            server.close(1003, 'Invalid public key encoding');
            return;
          }
          // Verify signature using the public key from payload
          const ok = await verifySignature(payload, sig, publicKeyBuf);
          if (!ok) {
            server.send(JSON.stringify({ type: 'register-result', payload: { ok: false, error: 'Invalid signature' }, sig: '', kid: '' }));
            server.close(1008, 'Invalid signature');
            return;
          }
          // Register the number in the Durable Object
          const id = env.VONUM_DO.idFromName('vonum');
          const stub = env.VONUM_DO.get(id);
          await stub.register(registerPayload.number, publicKeyBuf, registerPayload.metadata);
          // Update the connections map
          const oldWs = connections.get(registerPayload.number);
          if (oldWs) {
            oldWs.close(1000, 'Replaced by new connection');
            connections.delete(oldWs);
            reverse.delete(oldWs);
          }
          connections.set(registerPayload.number, server);
          reverse.set(server, registerPayload.number);
          // Respond success
          server.send(JSON.stringify({ type: 'register-result', payload: { ok: true }, sig: '', kid: '' }));
          return;
        }

        // For non-register messages, we need to verify the sender is registered and signature is valid
        const id = env.VONUM_DO.idFromName('vonum');
        const stub = env.VONUM_DO.get(id);
        const senderInfo = await stub.get(kid);
        if (!senderInfo) {
          server.send(JSON.stringify({ type: 'error', payload: { message: 'Sender not registered' }, sig: '', kid: '' }));
          server.close(1008, 'Sender not registered');
          return;
        }
        const ok = await verifySignature(payload, sig, senderInfo.publicKey);
        if (!ok) {
          server.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid signature' }, sig: '', kid: '' }));
          server.close(1008, 'Invalid signature');
          return;
        }

        // For non-register messages, we need to look up the target's connection
        const target = (payload as { target?: string }).target;
        if (!target) {
          server.send(JSON.stringify({ type: 'error', payload: { message: 'Missing target' }, sig: '', kid: '' }));
          return;
        }
        const targetConn = connections.get(target);
        if (!targetConn) {
          server.send(JSON.stringify({ type: 'error', payload: { message: 'Target not online' }, sig: '', kid: '' }));
          return;
        }

        // Forward the message to the target
        targetConn.send(event.data);
      });

      // Handle close events
      server.addEventListener('close', () => {
        const number = reverse.get(server);
        if (number) {
          connections.delete(number);
          reverse.delete(server);
        }
      });

      // Handle errors
      server.addEventListener('error', (err) => {
        console.error('WebSocket error:', err);
        const number = reverse.get(server);
        if (number) {
          connections.delete(number);
          reverse.delete(server);
        }
      });

      // Return the client side as the response (the browser will connect to this)
      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // Handle HTTP requests
    if (url.pathname === '/turn-token') {
      const id = env.VONUM_DO.idFromName('vonum');
      const obj = env.VONUM_DO.get(id);
      return obj.fetch(request);
    }
    return new Response('Vonum Worker OK', { status: 200 });
  }
} satisfies ExportedHandler<RegistryEnv>;
