/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unused-vars */
const WebSocket = require('ws');

const number = '123456';
const publicKeyB64url = 'AA'; // same as before

function sendRegister(ws) {
  const registerMsg = {
    type: 'register',
    payload: { number, publicKey: publicKeyB64url, metadata: { note: 'test' } },
    sig: '',
    kid: number
  };
  ws.send(JSON.stringify(registerMsg));
}

function sendResolve(ws) {
  const resolveMsg = {
    type: 'resolve',
    payload: { number },
    sig: '',
    kid: number // we use the same kid as sender; signature will be verified
  };
  ws.send(JSON.stringify(resolveMsg));
}

const ws = new WebSocket('ws://localhost:8787');

ws.on('open', () => {
  console.log('WebSocket connection opened');
  sendRegister(ws);
});

ws.on('message', (data) => {
  const msg = data.toString();
  console.log('Received:', msg);
  try {
    const parsed = JSON.parse(msg);
    if (parsed.type === 'register-result') {
      if (parsed.payload.ok) {
        console.log('Registration successful');
        // Now send resolve
        sendResolve(ws);
      } else {
        console.log('Registration failed:', parsed.payload);
        ws.close();
      }
    } else if (parsed.type === 'resolve-result') {
      if (parsed.payload.ok) {
        console.log('Resolve successful');
        console.log('Public key:', parsed.payload.publicKey);
        console.log('Metadata:', parsed.payload.metadata);
      } else {
        console.log('Resolve failed:', parsed.payload);
      }
      ws.close();
    } else if (parsed.type === 'error') {
      console.log('Error:', parsed.payload);
      ws.close();
    }
  } catch (e) {
    console.log('Failed to parse message:', e);
    ws.close();
  }
  });

ws.on('close', () => {
  console.log('WebSocket connection closed');
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err);
});
