const WebSocket = require('ws');
// Full Xray handshake for www.google.com:443 (exactly as seen in debug)
const buf = Buffer.from('00b46b7b0579d1405cb6f2ce73e8ffbe48000101bb020e7777772e676f6f676c652e636f6d', 'hex');
console.log('connecting to render...');
const ws = new WebSocket('wss://proxy-burc.onrender.com/vless-ws', {
  headers: { Host: 'proxy-burc.onrender.com' },
  rejectUnauthorized: true,
});
ws.on('open', () => { console.log('WS OPEN, sending handshake'); ws.send(buf, { binary: true }); });
ws.on('message', (d) => {
  console.log('RESP:', d.toString('hex'), 'len=', d.length);
  ws.close(); process.exit(0);
});
ws.on('error', (e) => { console.log('ERR:', e.message); process.exit(1); });
ws.on('close', (c, r) => { console.log('CLOSE:', c, r.toString()); process.exit(0); });
setTimeout(() => { console.log('TIMEOUT'); process.exit(0); }, 15000);