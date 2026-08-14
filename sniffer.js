// WS upgrade sniffer: accepts any WS upgrade, prints all raw headers, then sends 101.
// Run this and point OpenClash at it. We'll see exactly what headers Mihomo sends.
const http = require('http');
const crypto = require('crypto');

const server = http.createServer();
const port = 9501;

server.on('request', (req, res) => {
  console.log(`\n=== ${req.method} ${req.url} ===`);
  console.log('Headers:');
  for (const [k, v] of Object.entries(req.headers)) {
    console.log(`  ${k}: ${v}`);
  }
  console.log('Remote:', req.socket.remoteAddress, req.socket.remotePort);
  console.log('Cipher:', req.socket.getCipher ? req.socket.getCipher() : null);
  res.writeHead(404); res.end('not found');
});

// We need to sniff WS upgrades - they use the same request but server should 101
// Use raw socket upgrade
server.on('upgrade', (req, socket, head) => {
  console.log(`\n=== WS UPGRADE ${req.method} ${req.url} ===`);
  console.log('Headers:');
  for (const [k, v] of Object.entries(req.headers)) {
    console.log(`  ${k}: ${v}`);
  }
  console.log('Remote:', req.socket.remoteAddress, req.socket.remotePort);
  console.log('Cipher:', req.socket.getCipher ? req.socket.getCipher() : null);
  // Send 101
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-5AB5E32C0192').digest('base64');
  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
  ];
  socket.write(headers.join('\r\n') + '\r\n\r\n');
  // echo back any data to keep alive briefly
  socket.on('data', (d) => { console.log('  DATA:', d.slice(0, 64).toString('hex')); socket.write(d); });
  socket.on('close', () => console.log('  closed'));
});

server.listen(port, () => console.log(`WS sniffer on :${port}`));