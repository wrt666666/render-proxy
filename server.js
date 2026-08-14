const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const net = require('net');

const PORT = process.env.PORT || 3000;
const UUID = (process.env.UUID || crypto.randomUUID()).replace(/-/g, '');
const WS_PATH = process.env.WS_PATH || '/vless-ws';

const serverUUID = Buffer.from(UUID, 'hex');
const recent = [];
let wsConnectCount = 0;
let wsUpgradeCount = 0;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uuid: UUID, path: WS_PATH, timestamp: new Date().toISOString() }));
    return;
  }
  if (req.url === '/debug') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ recent, wsConnectCount, wsUpgradeCount }));
    return;
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({ server, path: WS_PATH, verifyClient: () => true });

wss.on('connection', (ws, req) => {
  wsConnectCount++;
  const ip = req.socket.remoteAddress || '-';
  console.log(`[WS] connect ${ip}`);
  let buffer = Buffer.alloc(0);

  function onRaw(data) {
    buffer = Buffer.concat([buffer, data]);
    // Log raw header hex for first 32 bytes on every connection
    if (buffer.length >= 4 && recent.length < 20) {
      recent.unshift({ ts: new Date().toISOString(), hex: buffer.slice(0, 32).toString('hex'), len: buffer.length });
      console.log(`  raw hex (first 32): ${buffer.slice(0, 32).toString('hex')}`);
    }
    if (buffer.length < 21) return;

    const version = buffer[0];
    for (let i = 0; i < 16; i++) {
      if (buffer[1 + i] !== serverUUID[i]) {
        recent.unshift({ ts: new Date().toISOString(), hex: buffer.slice(0, 32).toString('hex'), len: buffer.length, err: 'uuid' });
        ws.close(1002, 'uuid mismatch');
        return;
      }
    }

    const addInfoLen = buffer[17];
    const cmd = buffer[18];

    const portOffset = 19;
    if (buffer.length < portOffset + 2) return;
    const port = buffer[portOffset] * 256 + buffer[portOffset + 1];

    const addrTypeOffset = portOffset + 2;
    const addrType = buffer[addrTypeOffset];
    let addrLen;
    if (addrType === 1) addrLen = 4;
    else if (addrType === 2) {
      if (buffer.length < addrTypeOffset + 2) return;
      addrLen = 1 + buffer[addrTypeOffset + 1];
    }
    else if (addrType === 3) addrLen = 16;
    else { ws.close(1002, 'bad addr type'); return; }

    const addrDataOffset = addrTypeOffset + 1;
    const addInfoOffset = addrDataOffset + addrLen;
    if (buffer.length < addInfoOffset + addInfoLen) return;

    let addr;
    if (addrType === 1) addr = `${buffer[addrDataOffset+0]}.${buffer[addrDataOffset+1]}.${buffer[addrDataOffset+2]}.${buffer[addrDataOffset+3]}`;
    else if (addrType === 2) addr = buffer.slice(addrDataOffset+1, addrDataOffset+1+buffer[addrDataOffset]).toString('utf8');
    else {
      const parts = [];
      for (let i = 0; i < 8; i++) parts.push((buffer[addrDataOffset+i*2]*256+buffer[addrDataOffset+1+i*2]).toString(16));
      addr = parts.join(':');
    }

    const dataStart = addInfoOffset + addInfoLen;
    const remaining = buffer.length > dataStart ? buffer.slice(dataStart) : null;
    buffer = Buffer.alloc(0);
    ws.removeListener('data', onRaw);

    console.log(`  ${addr}:${port} cmd=${cmd} ver=${version}`);
    ws.send(Buffer.from([version, 0x00, 0x00, 0x00, 0x00, 0x00]));

    const dest = net.connect(port, addr, () => { if (remaining && remaining.length > 0) dest.write(remaining); });
    dest.on('data', (c) => { if (ws.readyState === 1) ws.send(c, { binary: true }); });
    dest.on('end', () => { if (ws.readyState === 1) ws.close(); });
    dest.on('error', (e) => { console.error(`  dest err: ${e.message}`); ws.close(1011); });

    ws.on('data', (c) => { if (dest.writable) dest.write(c); });
    ws.on('close', () => { if (dest.writable) dest.end(); });
    ws.on('error', () => { if (dest.writable) dest.end(); });
  }

  ws.on('data', onRaw);
  ws.on('error', (e) => console.error('ws err:', e.message));
});

server.listen(PORT, () => { console.log(`VLESS+WS port=${PORT} uuid=${UUID} path=${WS_PATH}`); });