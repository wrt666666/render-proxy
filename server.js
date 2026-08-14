const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const net = require('net');

const PORT = process.env.PORT || 3000;
const UUID = (process.env.UUID || crypto.randomUUID()).replace(/-/g, '');
const WS_PATH = process.env.WS_PATH || '/vless-ws';
const serverUUID = new Uint8Array(16);
for (let i = 0; i < 32; i += 2) {
  serverUUID[i >> 1] = parseInt(UUID.substr(i, 2), 16);
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      uuid: UUID,
      path: WS_PATH,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

const wss = new WebSocketServer({ server, path: WS_PATH });

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress || '-';
  console.log(`[${new Date().toISOString()}] WS connect from ${ip}`);

  let buffer = Buffer.alloc(0);

  const onHeader = (data) => {
    buffer = Buffer.concat([buffer, data]);
    if (buffer.length < 20) return;

    // UUID match
    for (let i = 0; i < 16; i++) {
      if (buffer[i] !== serverUUID[i]) {
        ws.close(1002, 'UUID mismatch');
        return;
      }
    }

    const addrType = buffer[16];
    let addrLen;
    if (addrType === 1) addrLen = 4;
    else if (addrType === 2) addrLen = 1 + buffer[17];
    else if (addrType === 3) addrLen = 16;
    else { ws.close(1002, 'Bad addr type'); return; }

    const portStart = 17 + addrLen;
    if (buffer.length < portStart + 3) return;

    const port = buffer[portStart] * 256 + buffer[portStart + 1];
    const cmd = buffer[portStart + 2];

    let addr;
    if (addrType === 1) {
      addr = `${buffer[17]}.${buffer[18]}.${buffer[19]}.${buffer[20]}`;
    } else if (addrType === 2) {
      addr = buffer.slice(18, 18 + buffer[17]).toString('utf8');
    } else {
      const parts = [];
      for (let i = 0; i < 8; i++) {
        parts.push(((buffer[17 + i * 2]) * 256 + buffer[18 + i * 2]).toString(16));
      }
      addr = parts.join(':');
    }

    const consumed = portStart + 3;
    const remaining = buffer.length > consumed ? buffer.slice(consumed) : null;
    buffer = Buffer.alloc(0);
    ws.removeListener('data', onHeader);

    // VLESS response header: version(0) + response(0) + flags(0) + reserved(2) + security(0)
    ws.send(Buffer.from([0, 0, 0, 0, 0, 0]));

    const dest = net.connect(port, addr, () => {
      if (remaining && remaining.length > 0) dest.write(remaining);
    });

    dest.on('data', (chunk) => {
      if (ws.readyState === 1) ws.send(chunk, { binary: true });
    });
    dest.on('end', () => { if (ws.readyState === 1) ws.close(); });
    dest.on('error', (err) => {
      console.error(`dest error: ${err.message}`);
      ws.close(1011, 'dest error');
    });

    ws.on('data', (chunk) => { if (dest.writable) dest.write(chunk); });
    ws.on('close', () => { if (dest.writable) dest.end(); });
    ws.on('error', () => { if (dest.writable) dest.end(); });

    console.log(`  -> ${addr}:${port} (cmd=${cmd})`);
  };

  ws.on('data', onHeader);
});

server.listen(PORT, () => {
  console.log(`════════════════════════════════════════`);
  console.log(`  VLESS+WS proxy on port ${PORT}`);
  console.log(`  UUID: ${UUID}`);
  console.log(`  WS path: ${WS_PATH}`);
  console.log(`  Health: /health`);
  console.log(`════════════════════════════════════════`);
});