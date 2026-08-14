// Build a raw HTTP/2 frame manually to test what CF returns for WS upgrade over h2.
// Frame types: 0x00 DATA, 0x01 HEADERS, 0x04 SETTINGS, 0x0A WINDOW_UPDATE
const tls = require('tls');
const crypto = require('crypto');

function h2Frame(type, flags, stream, payload) {
  const buf = Buffer.alloc(9 + payload.length);
  buf.writeUInt32BE(payload.length, 0);
  buf[4] = type;
  buf[5] = flags;
  buf.writeUInt32BE(stream, 6);
  payload.copy(buf, 9);
  return buf;
}

function hpackEncode(headers) {
  // Minimal HPACK: we just encode the headers we need as literal with no index
  // This is simplified - real HPACK needs proper Huffman encoding
  // Instead let's use a proper hpack library or the approach below
  return null;
}

// Use node's http2 library to build HPACK-encoded headers for us, then send raw.
const http2 = require('http2');

// Create a "fake" session just to encode headers via hpack
const encoder = new http2.HeaderListEncoder();

const socket = tls.connect(443, 'proxy-burc.onrender.com', {
  servername: 'proxy-burc.onrender.com',
  ALPNProtocols: ['h2'],
  rejectUnauthorized: false,
}, () => {
  console.log('ALPN:', socket.alpnProtocol);
  if (socket.alpnProtocol !== 'h2') {
    console.log('Not h2');
    socket.destroy(); process.exit(0);
    return;
  }

  // Send connection preface + SETTINGS
  const preface = Buffer.from('PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n');
  const settings = h2Frame(0x04, 0x01, 0, Buffer.alloc(0)); // SETTINGS ACK
  const clientSettings = h2Frame(0x04, 0x00, 0, Buffer.alloc(6)); // SETTINGS len=6
  socket.write(Buffer.concat([preface, clientSettings, settings]));

  // Build HEADERS frame with pseudo + regular headers
  // We need HPACK encoding. Use http2 library to encode for us.
  // Node's http2.setHeaderTableSize etc. Instead, just use built-in encoder:
  const h2headers = http2.formatRequestHeaders({
    ':method': 'GET',
    ':path': '/vless-ws',
    ':authority': 'proxy-burc.onrender.com',
    ':scheme': 'https',
    'host': 'proxy-burc.onrender.com',
    'upgrade': 'websocket',
    'connection': 'upgrade',
    'sec-websocket-key': crypto.randomBytes(16).toString('base64'),
    'sec-websocket-version': '13',
    'user-agent': 'mihomo/1.0',
  });

  console.log('Encoded headers length:', h2headers.length);

  // Send HEADERS on stream 1
  socket.write(h2Frame(0x01, 0x04, 1, h2headers)); // END_STREAM + END_HEADERS
  // Send CONTINUATION if needed - but formatRequestHeaders returns all headers

  // Send WINDOW_UPDATE to allow data
  socket.write(h2Frame(0x08, 0, 0, Buffer.alloc(4)));

  let received = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    received = Buffer.concat([received, chunk]);
    if (received.length < 24) return; // wait for SETTINGS + SETTINGS_ACK
    // Parse frames
    let offset = 0;
    while (offset + 9 <= received.length) {
      const len = received.readUInt32BE(offset);
      const type = received[offset + 4];
      const flags = received[offset + 5];
      const stream = received.readUInt32BE(offset + 6);
      const payload = offset + 9 + len <= received.length ? received.slice(offset + 9, offset + 9 + len) : null;
      const typeNames = { 0: 'DATA', 1: 'HEADERS', 2: 'PRIORITY', 3: 'RST_STREAM', 4: 'SETTINGS', 5: 'PUSH_PROMISE', 6: 'PING', 7: 'GOAWAY', 8: 'WINDOW_UPDATE', 9: 'CONTINUATION' };
      console.log(`Frame: ${typeNames[type]||type} flags=${flags.toString(16)} stream=${stream} len=${len}`);
      if (payload && type === 1) {
        // Decode HEADERS
        try {
          const decoder = new http2.HeaderListDecoder();
          const decoded = decoder.decode(payload);
          console.log('Response headers:', decoded);
        } catch(e) {
          console.log('HPACK decode fail:', e.message);
          console.log('Raw hex:', payload.slice(0, 200).toString('hex'));
        }
      }
      if (!payload) break;
      offset += 9 + len;
    }
    if (received.length > 1000) {
      socket.destroy(); process.exit(0);
    }
  });

  socket.setTimeout(15000, () => { socket.destroy(); process.exit(0); });
  socket.on('error', (e) => { console.log('SOCKET ERR:', e.message); process.exit(0); });
});

socket.on('error', (e) => { console.log('SOCKET ERR2:', e.message); process.exit(0); });