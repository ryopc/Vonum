# Vonum Protocol Specification

## Overview
Vonum uses virtual phone numbers (short identifiers such as 6-digit numbers) to enable WebRTC-based P2P voice calls. Signaling and registry are provided by Cloudflare Workers + Durable Objects (WebSocket). Media is Opus over DTLS-SRTP, with P2P as the primary mode and TURN as a fallback when P2P cannot be established.

## Terminology
- **Number**: A short identifier entered by the user (e.g., 123456). Unrelated to PSTN.
- **PublicKey**: The public side of an Ed25519 key pair. A number may map 1:1 or many:1 to public keys (number collisions are allowed).
- **SecretKey**: The private side of the same key pair, used for signing.
- **Registry**: Mapping inside a Durable Object: `number → {publicKey, metadata, wsConnections}`.
- **Signaling Message**: JSON messages exchanged over WebSocket (offer, answer, ice-candidate, register-resolve, etc.).
- **TURN Authentication Token**: A short-lived JWT (or random token) issued by Workers for authenticating to a TURN server.

## Architecture
```
+----------------+        WS        +------------------+
|  Browser       | <---------->   | Cloudflare Worker|
|  (Client)      |                | + Durable Object |
+----------------+                  +------------------+
        ^                                 ^
        | HTTPS (WSS)                     | HTTPS (WSS)
        |                                 |
+----------------+        WS        +------------------+
|  TURN Server   | <---------->   | Same Worker (token issuance) |
+----------------+                  +------------------+
```
- Workers expose an HTTP endpoint for issuing TURN authentication tokens.
- Durable Object acts as a singleton per registry (multiple instances can be sharded via consistent hashing if needed).
- WebSocket connections are managed in rooms keyed by number (or a global room).

## Resolver Interface (Abstraction)
```typescript
interface Resolver {
  /** Register a number with a public key and optional metadata. First‑come‑first‑served. */
  register(number: string, publicKey: Uint8Array, metadata?: any): Promise<void>;
  /** Resolve a number to its public key and metadata. Returns null if not found. */
  resolve(number: string): Promise<{publicKey: Uint8Array; metadata?: any} | null>;
  /** Optionally revoke a registration. */
  revoke(number: string): Promise<void>;
}
```
- Default implementation: the Durable Object described above.
- Future implementations (e.g., Nostr relay, DHT) should conform to this interface.

## Number‑to‑PublicKey Relationship
- Numbers are intended to be easy‑to‑remember 6‑digit strings (000000–999999). Digit length `d` is configurable.
- Collision probability: approximately $P_{coll} \approx 1 - e^{-n^2/(2 \cdot 10^d)}$, where `n` is the number of concurrently registered users.
- A number alone does **not** guarantee identity. **Public key verification is mandatory** when establishing a call.
- On first registration, the number‑→‑public key mapping is trusted (**key pinning**). Subsequent changes trigger a warning (displayed in UI; optional blocking).
- Reuse of a number after release may be allowed after a waiting period (e.g., 30 days) or permanently locked—this is an implementation choice.

## Signaling & Authentication
All signaling messages are signed with the sender’s Ed25519 secret key to prevent tampering.

### Common Message Format
```json
{
  "type": "<message-type>",   // register | resolve | register-result | offer | answer | ice-candidate | hangup | error
  "payload": { ... },         // type‑specific payload
  "sig": "<base64url>",       // Ed25519 signature (canonical JSON of payload)
  "kid": "<number>"           // Sender's number (used to fetch the public key from the registry)
}
```
- The signature covers only the `payload` field (encoded as compact JSON without whitespace).
- Upon receipt, the verifier looks up the public key via `kid` in the registry and checks the `sig`.

### Message Types and Payloads
| type | payload description |
|------|---------------------|
| register | `{ number: string, publicKey: string (base64url), metadata?: any }` |
| resolve | `{ number: string }` |
| register-result | `{ ok: boolean, error?: string }` |
| offer | `{ sdp: string, fingerprint: string (SHA‑256 hex of DTLS certificate) }` |
| answer | `{ sdp: string, fingerprint: string }` |
| ice-candidate | `{ candidate: string, sdpMid: string, sdpMLineIndex: number }` |
| hangup | `{ reason?: string }` |
| error | `{ message: string }` |

- `fingerprint` is extracted from the SDP line `a=fingerprint:sha-256 XX:XX:…`. Including it in the signed payload prevents a man‑in‑the‑middle from altering the SDP undetected.
- For offer/answer, the sender signs the object `{sdp, fingerprint}` with its secret key.

### Example Flow
1. **Registration**  
   Client → Worker: signed `register` message.  
   Worker: checks number availability, stores in registry, replies with `register-result`.
2. **Resolution**  
   Caller → Worker: signed `resolve` (target number).  
   Worker: looks up public key/metadata and returns it (either via a custom message or bundled in the offer flow).
3. **Offer/Answer Exchange**  
   Caller → Worker: signed `offer`.  
   Worker: forwards the message (signature intact) to the callee’s WebSocket.  
   Callee → Worker: signed `answer`.  
   Worker: forwards to caller.  
   ICE candidates are exchanged similarly via `ice-candidate` messages.
4. **Hangup**  
   Either party → Worker: signed `hangup`.  
   Worker: notifies the peer and closes both WebSocket connections.

## NAT Traversal & Media
- **STUN**: Use a public STUN server (e.g., `stun.l.google.com:19302`) or a lightweight STUN endpoint provided by Workers.
- **TURN**: Assume Cloudflare Calls TURN. Authentication uses short‑lived tokens (e.g., HMAC‑SHA256(secret, timestamp|username)).  
  - Clients fetch a token from the Worker’s `/turn-token` endpoint (rate‑limited, no auth required).  
  - Token validity is short (e.g., 10 minutes).
- Media codec: Opus (fixed).  
- Transport: DTLS‑SRTP (handled by the browser’s WebRTC implementation).  
- If ICE fails to find a direct path, the client adds TURN addresses gathered via the token.

## Abuse Prevention
- **Rate Limiting**  
  - `register`: 10 attempts/min per IP, 5/min per number.  
  - `resolve`: 30/min per IP.  
  - Token issuance: 20/min per IP.  
  - Exceeding limits returns HTTP 429.
- **Blocklist**: Registry maintains a `blocked: Set<number>`; registration and resolution checks are performed.
- **Call Rejection**: Clients manage their own reject lists; the server only relays messages.
- **Optional PoW/Captcha**: Registration may require a simple hash‑cash (e.g., leading zero count) to raise the cost of spam (implementation optional).

## Security Assumptions & Threat Model
### Assumptions
- The browser’s WebRTC/DTLS‑SRTP implementation is secure.
- Durable Object state is accessed single‑threadedly, preserving consistency.
- The Workers execution environment is untampered (relying on Cloudflare’s trust base).
- TLS (WSS) provides confidentiality and integrity.

### Threats and Mitigations
| Threat | Description | Mitigation |
|--------|-------------|------------|
| Signaling MITM | Message tampering or impersonation | Ed25519 signatures + SDP fingerprint signature detect alterations |
| Number Squatting | Brute‑force registration of many numbers | Rate limits; optional PoW cost |
| Public‑Key Replacement | Hijacking a number to publish a fake key | Key pinning (initial trust) + change warnings |
| TURN Relay Abuse | Exhausting bandwidth or incurring costs | Short‑lived auth tokens, usage monitoring, rate limits |
| Replay Attack | Resending old signed messages | Include timestamp/nonce in signatures (optional; short TTL also helps) |
| Worker DoS | Flood of requests | Rate limits; rely on Workers’ automatic scaling (mind free‑quota limits) |

## Client‑Side State Model (Simplified)
```
[Idle]
  --register--> [Registered]
  --resolve--> [Resolved]   (store obtained publicKey/metadata)
  --offer-->  [Calling]     (caller side)
  <--answer-- [InCall]     (callee side)
  --ice-candidate--> (ICE in progress)
  --media-->    [Connected] (media established)
  --hangup-->   [Idle]
```
- On error, return to `Idle` or retry as appropriate.

## Error Handling
- Signaling‑layer errors are conveyed via an `error` message.
- Causes include malformed JSON, signature mismatch, or registry errors; the `message` field should describe the issue.
- Clients display errors in the UI and may offer a retry option.

## Message Format (JSON‑Schema‑Inspired)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["type", "payload", "sig", "kid"],
  "properties": {
    "type": { "type": "string", "enum": ["register","resolve","register-result","offer","answer","ice-candidate","hangup","error"] },
    "payload": { "type": "object" },
    "sig": { "type": "string", "contentEncoding": "base64url", "contentMediaType": "application/octet-stream" },
    "kid": { "type": "string", "pattern": "^[0-9]+$" }
  },
  "additionalProperties": false
}
```
Each `payload` type follows the table above.

## Implementation Notes (Reference Implementation)
### Worker (`index.ts`)
- **HTTP Endpoints**  
  - `POST /turn-token` → after rate limiting, issue an HMAC token (secret obtained via `wrangler secret`).  
  - `GET /health` → simple liveness check.
- **WebSocket Handler**  
  - On connection, await the first message to obtain `kid`; verify the sender’s public key from the registry.  
  - Broadcast or forward messages based on `kid` (room per number or global room).  
  - Drop connections on signature verification failure.

### Durable Object (`state.ts`)
- **State**  
  ```ts
  state = {
    registry: Map<string, {publicKey: Uint8Array; metadata?: any; ws: Set<WebSocket>>},
    blocked: Set<string> // numbers
  }
  ```
- **Methods**  
  - `register(number, publicKey, metadata)`: first‑come‑first‑served after `blocked` check; `registry.set`.  
  - `resolve(number)`: return `registry.get(number)` or `undefined`.  
  - `hangup(fromNumber)`: send a `hangup` message to the peer’s WebSocket set and close both ends.  
  - On incoming WebSocket message: verify signature using the public key from `kid`; if valid, forward to all connections except the sender (or to the specific target number’s connections).

### Client (`index.html` + `main.js`)
- Single HTML file loading an ES module script (`<script type="module" src="./main.js"></script>`).
- UI: number input field, **Call** button, **Hangup** button, status display.
- WebRTC Wrapper  
  - Configure `RTCPeerConnection` with STUN/TURN servers (dynamic TURN token from Worker).  
  - Custom WebSocket wrapper sends/receives signed messages.  
  - Local stream: `navigator.mediaDevices.getUserMedia({audio: true})`.  
  - Incoming call handling: either auto‑generate offer on `onnegotiationneeded` or wait for remote offer, then `setRemoteDescription` → `createAnswer`.  
- Edge Cases: If `getUserMedia` fails (e.g., due to privacy mode), show an error.

## Free‑Tier Operational Considerations
- **Workers**: Daily request limit (100,000). Enforce rate‑limiting to stay within quota.  
- **Durable Objects**: Free tier allows up to 1,000 instances; a single registry instance is well within limits. CPU time per instance is generous; avoid heavy computations.  
- **WebSocket Hibernation**: After 30 minutes of inactivity, connections sleep and automatically resume on activity (implement client‑side reconnect logic).  
- **TURN Token Endpoint**: Apply the same rate‑limiting to prevent abuse‑driven cost increases.

## Future Extension Points
- Make the `Resolver` pluggable to swap in Nostr relay, IPFS pubsub, etc. without changing the rest of the system.  
- Add timestamps or nonces to signatures for stronger replay‑attack resistance.  
- Make number length and PoW difficulty configurable.  
- Extend to video streams (audio‑only for now).

---
*This specification outlines the Vonum protocol, security considerations, and reference implementation. Implementations should adhere to these guidelines, adjusting details as needed.* 
