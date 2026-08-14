const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const net = require('net');

const PORT = process.env.PORT || 3000;
const UUID = (process.env.UUID || crypto.randomUUID()).replace(/-/g, '');
const WS_PATH = process.env.WS_PATH || '/vless-ws';

// VLESS v4 UUID as raw bytes [1..16] in header
const serverUUID = new Uint8Array(16);
for (let i = 0; i < 32; i += 2) {
  serverUUID[i >> 1] = parseInt(UUID.substr(i, 2), 16);
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uuid: UUID, path: WS_PATH, timestamp: new Date().toISOString() }));
    return;
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({ server, path: WS_PATH, verifyClient: (info) => true });

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress || '-';
  console.log(`[WS] connect ${ip} url=${req.url}`);
  let buffer = Buffer.alloc(0);

  function onRaw(data) {
    buffer = Buffer.concat([buffer, data]);
    // VLESS v4 minimal header: version(1)+uuid(16)+opt_len(1)+addr_type(1)+addr(N)+port(2)+cmd(1)+addon_len(2)+addon
    if (buffer.length < 21) return; // version+uuid+opt_len+addr_type = 19 min, need >= 21 for at least IPv4

    // 1. version
    const version = buffer[0];
    console.log(`  version=${version}`);

    // 2. uuid [1..16]
    for (let i = 0; i < 16; i++) {
      if (buffer[1 + i] !== serverUUID[i]) {
        ws.close(1002, 'uuid mismatch');
        console.log('  REJECT uuid mismatch');
        return;
      }
    }
    console.log('  uuid OK');

    // 3. opt_len [17] — high bit(0)=is_cmd, low 7 bits=opts_len
    const optByte = buffer[17];
    const optsLen = optByte & 0x7f;
    const optStart = 18;
    if (buffer.length < optStart + optsLen) return;
    const addrStart = optStart + optsLen;

    // 4. addr_type
    const addrType = buffer[addrStart];
    let addrLen;
    if (addrType === 1) addrLen = 4;
    else if (addrType === 2) {
      if (buffer.length < addrStart + 2) return;
      addrLen = 1 + buffer[addrStart + 1];
    }
    else if (addrType === 3) addrLen = 16;
    else { ws.close(1002, 'bad addr type'); console.log('REJECT bad addr'); return; }

    const portStart = addrStart + 1 + addrLen;
    if (buffer.length < portStart + 2) return;

    const port = buffer[portStart] * 256 + buffer[portStart + 1];
    const cmd = buffer[portStart + 2];
    const addonLenStart = portStart + 3;
    if (buffer.length < addonLenStart + 2) return;
    const addonLen = buffer[addonLenStart] * 256 + buffer[addonLenStart + 1];

    let addr;
    if (addrType === 1) addr = `${buffer[addrStart+1]}.${buffer[addrStart+2]}.${buffer[addrStart+3]}.${buffer[addrStart+4]}`;
    else if (addrType === 2) addr = buffer.slice(addrStart+2, addrStart+2+buffer[addrStart+1]).toString('utf8');
    else {
      const parts = [];
      for (let i = 0; i < 8; i++) parts.push((buffer[addrStart+1+i*2]*256+buffer[addrStart+2+i*2]).toString(16));
      addr = parts.join(':');
    }

    const dataStart = addonLenStart + 2 + addonLen;
    const remaining = buffer.length > dataStart ? buffer.slice(dataStart) : null;
    buffer = Buffer.alloc(0);
    ws.removeListener('data', onRaw);

    console.log(`  ${addr}:${port} cmd=${cmd} addon_len=${addonLen}`);

    // VLESS v4 response: version(1)+flags(1)+reserved(2)+addon_len(2)+addon_data
    const resp = Buffer.from([0x04, 0x00, 0x00, 0x00, 0x00, 0x00]);
    ws.send(resp);

    const dest = net.connect(port, addr, () => {
      if (remaining && remaining.length > 0) dest.write(remaining);
    });
    dest.on('data', (c) => { if (ws.readyState === 1) ws.send(c, { binary: true }); });
    dest.on('end', () => { if (ws.readyState === 1) ws.close(); });
    dest.on('error', (e) => { console.error(`  dest err: ${e.message}`); ws.close(1011); });

    ws.on('data', (c) => { if (dest.writable) dest.write(c); });
    ws.on('close', () => { if (dest.writable) dest.end(); });
    ws.on('error', () => { if (dest.writable) dest.end(); });
  }

  ws.on('data', onRaw);
});

server.listen(PORT, () => {
  console.log(`VLESS+WS proxy port=${PORT} uuid=${UUID} path=${WS_PATH}`);
});