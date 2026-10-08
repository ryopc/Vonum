/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unused-vars */
const WebSocket = require('ws');

const number = '123456'; // fixed for now
const payload = {
  number,
  publicKey: 'AA', // valid base64url for 0x00
  metadata: { note: 'test' }
};
const payloadString = JSON.stringify(payload);
// Dummy signature (empty string)
const signature = '';
const message = {
  type: 'register',
  payload,
  sig: signature,
  kid: number
};
const messageString = JSON.stringify(message);

const ws = new WebSocket('ws://localhost:8787');

ws.on('open', () => {
  console.log('WebSocket connection opened');
  ws.send(messageString);
});

ws.on('message', (data) => {
  const msg = data.toString();
  console.log('Received:', msg);
  // If we get a register-result, we can check if ok is true
  if (msg.includes('register-result')) {
    // Parse and check
    try {
      const parsed = JSON.parse(msg);
      if (parsed.type === 'register-result' && parsed.payload.ok) {
        console.log('Registration successful');
      } else {
        console.log('Registration failed:', parsed);
      }
    } catch (e) {
      console.log('Failed to parse response:', e);
    }
  }
  ws.close();
});

ws.on('close', () => {
  console.log('WebSocket connection closed');
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err);
});

