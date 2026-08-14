// Raw HTTP/2 WebSocket upgrade test: connect to proxy-burc.onrender.com over TLS,
// ALPN=h2, send connection preface + SETTINGS, then HEADERS frame with
// `:method GET :path /vless-ws upgrade:websocket ...`
// This is what Mihomo/OpenClash VLESS over WS over h2 would look like.
// If CF returns 427 or 400, that's our root cause.

const tls = require('tls');
const crypto = require('crypto');
const { HeaderListEncoder, formatRequestHeaders } = require('http2');

function h2Frame(type, flags, stream, payload) {
  const buf = Buffer.alloc(9 + payload.length);
  buf.writeUInt32BE(payload.length, 0);
  buf[4] = type; buf[5] = flags; buf.writeUInt32BE(stream, 6);
  payload.copy(buf, 9);
  return buf;
}

const socket = tls.connect(443, 'proxy-burc.onrender.com', {
  servername: 'proxy-burc.onrender.com',
  ALPNProtocols: ['h2'],
  rejectUnauthorized: false,
}, () => {
  console.log('ALPN:', socket.alpnProtocol);
  if (socket.alpnProtocol !== 'h2') { console.log('not h2'); process.exit(0); }

  // Connection preface + SETTINGS
  socket.write(Buffer.from('PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n'));
  socket.write(h2Frame(0x04, 0, 0, Buffer.alloc(6))); // SETTINGS length=6

  // Encode HEADERS payload via http2 lib (uses HPACK)
  const key = crypto.randomBytes(16).toString('base64');
  const hpack = formatRequestHeaders({
    ':method': 'GET',
    ':path': '/vless-ws',
    ':authority': 'proxy-burc.onrender.com',
    ':scheme': 'https',
    'host': 'proxy-burc.onrender.com',
    'upgrade': 'websocket',
    'connection': 'upgrade',
    'sec-websocket-key': key,
    'sec-websocket-version': '13',
    'user-agent': 'mihomo/1.19.3',
  });

  socket.write(h2Frame(0x01, 0x04, 1, hpack));
  console.log('HEADERS sent, hpack len:', hpack.length);

  // Parse response frames
  let buf = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    let off = 0;
    while (off + 9 <= buf.length) {
      const len = buf.readUInt32BE(off);
      const type = buf[off+4]; const flags = buf[off+5];
      const stream = buf.readUInt32BE(off+6);
      if (off + 9 + len > buf.length) break;
      const payload = buf.slice(off+9, off+9+len);
      const types = {0:'DATA',1:'HEADERS',2:'PRIORITY',3:'RST_STREAM',4:'SETTINGS',5:'PUSH_PROMISE',6:'PING',7:'GOAWAY',8:'WINDOW_UPDATE',9:'CONTINUATION'};
      console.log(`Frame ${types[type]||type} flags=${flags.toString(16)} stream=${stream} len=${len}`);
      if (type === 1 && flags & 0x04) {
        try {
          const dec = new HeaderListEncoder(); // decoder? actually Encoder decodes
          const dec2 = new (class Dec { constructor(){this.enc = new HeaderListEncoder();} });
          // Node's HeaderListEncoder is actually a Decoder (decodes hpack -> js)
          const decoded = dec.decode(payload);
          console.log('Response:', JSON.stringify(decoded));
        } catch(e) { console.log('Decode fail:', e.message); console.log(payload.slice(0,100).toString('hex')); }
      }
      off += 9 + len;
    }
    if (buf.length > 5000) { socket.destroy(); process.exit(0); }
  });
  socket.setTimeout(15000, () => { socket.destroy(); process.exit(0); });
});
socket.on('error', e => { console.log('ERR:', e.message); process.exit(0); });