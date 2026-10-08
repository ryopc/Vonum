// Vonum Client - placeholder implementation
(() => {
  const statusEl = document.getElementById('status');
  const numberInput = document.getElementById('number-input');
  const callBtn = document.getElementById('call-btn');
  const hangupBtn = document.getElementById('hangup-btn');
  const body = document.body;
  const workerUrl = body.dataset.workerUrl || '';

  function setStatus(msg) {
    statusEl.textContent = msg;
    console.log(msg);
  }

  // Generate Ed25519 key pair for this client
  async function generateKeyPair() {
    return await crypto.subtle.generateKey(
      {
        name: 'Ed25519'
      },
      true, // extractable
      ['sign', 'verify']
    );
  }

  // Sign payload with private key
  async function signPayload(privateKey, payload) {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(payload));
    const signature = await crypto.subtle.sign('Ed25519', privateKey, data);
    return btoa(String.fromCharCode(...new Uint8Array(signature))); // base64
  }

  // Placeholder for WebSocket connection
  let ws = null;
  let pc = null; // RTCPeerConnection
  let localStream = null;
  let remoteStream = null;

  async function init() {
    setStatus('Initializing...');
    try {
      const keyPair = await generateKeyPair();
      setStatus('Key pair generated');
      // TODO: register with worker via WebSocket
      // TODO: set up RTCPeerConnection with STUN/TURN
      // TODO: handle call button
    } catch (e) {
      setStatus('Error: ' + e);
      console.error(e);
    }
  }

  callBtn.addEventListener('click', async () => {
    const number = numberInput.value.trim();
    if (!number) {
      setStatus('Please enter a number');
      return;
    }
    setStatus(`Calling ${number}...`);
    // TODO: implement call logic
  });

  hangupBtn.addEventListener('click', () => {
    setStatus('Hanging up...');
    // TODO: implement hangup
    callBtn.disabled = false;
    hangupBtn.disabled = true;
  });

  init();
})();
