const WebSocket = require('ws');
const fs = require('fs');

// Simulate what OpenClash/Mihomo VLESS client does
// 1. WS upgrade to wss://proxy-burc.onrender.com/vless-ws
// 2. Send VLESS handshake: version(1) + uuid(16) + addInfoLen(1) + cmd(1) + port(2) + addrType(1) + addr
// 3. Receive 2-byte response [00 00]

const UUID_HEX = 'b46b7b0579d1405cb6f2ce73e8ffbe48';
const targetAddr = 'www.youtube.com';
const targetPort = 443;

// Build VLESS request header
const buf = Buffer.alloc(24 + targetAddr.length);
buf[0] = 0x00; // version
Buffer.from(UUID_HEX, 'hex').copy(buf, 1);
buf[17] = 0x00; // addInfoLen
buf[18] = 0x00; // cmd (TCP)
buf[19] = (targetPort >> 8) & 0xff;
buf[20] = targetPort & 0xff;
buf[21] = 0x02; // domain type
buf[22] = targetAddr.length;
Buffer.from(targetAddr).copy(buf, 23);

console.log('handshake hex:', buf.toString('hex'));
console.log('connecting to wss://proxy-burc.onrender.com/vless-ws ...');

const ws = new WebSocket('wss://proxy-burc.onrender.com/vless-ws', {
  headers: { Host: 'proxy-burc.onrender.com' },
  rejectUnauthorized: true,
});

let dataCount = 0;
ws.on('open', () => {
  console.log('[X] WS OPEN, sending handshake...');
  ws.send(buf, { binary: true });
});
ws.on('message', (data) => {
  dataCount++;
  if (dataCount === 1) {
    console.log('[X] 1st message: hex=', data.toString('hex'), 'len=', data.length);
    if (data.length === 2) {
      console.log('[X] Response OK, sending TLS ClientHello...');
      // Send a minimal TLS ClientHello to trigger a real connection
      const hello = Buffer.from(
        '16030100' + '0010'.padStart(6,'0') +
        '010000' + '0c' + '0301' + // random (shortened)
        '00 00 00'.replace(/ /g,'00').padEnd(16,'0'), 'hex');
      ws.send(hello, { binary: true });
    }
  } else if (dataCount <= 5) {
    console.log('[X] data', dataCount, ': hex=', data.slice(0,32).toString('hex'), 'len=', data.length);
  }
});
ws.on('error', (e) => { console.log('[X] ERROR:', e.message); });
ws.on('close', (code, reason) => {
  console.log('[X] CLOSED:', code, reason.toString('utf8'));
  process.exit(0);
});
setTimeout(() => { console.log('[X] TIMEOUT'); process.exit(0); }, 30000);