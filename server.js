const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const net = require('net');

const PORT = process.env.PORT || 3000;
// OpenClash-configured UUID: b46b7b05-79d1-405c-b6f2-ce73e8ffbe48
const UUID = 'b46b7b0579d1405cb6f2ce73e8ffbe48';
const WS_PATH = process.env.WS_PATH || '/vless-ws';

const serverUUID = Buffer.from(UUID, 'hex');
const events = [];

const server = http.createServer((req, res) => {
  events.unshift({ t: Date.now(), e: 'http', url: req.url });
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uuid: UUID, path: WS_PATH }));
    return;
  }
  if (u.pathname === '/debug') {
    const n = parseInt(u.searchParams.get('n') || '20');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ events: events.filter(e => e.e !== 'http').slice(0, n) }));
    return;
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({ server, verifyClient: (info, cb) => {
  events.unshift({ t: Date.now(), e: 'verifyClient', path: info.req.url, headers: JSON.stringify(info.req.headers) });
  cb(true);
}});

wss.on('connection', (ws, req) => {
  events.unshift({ t: Date.now(), e: 'ws-connect', path: req.url, origin: req.headers['origin'] });
  let buffer = Buffer.alloc(0);

  function onMsg(msg) {
    const data = Buffer.isBuffer(msg) ? msg : Buffer.from(msg);
    events.unshift({ t: Date.now(), e: 'msg', hex: data.toString('hex').slice(0, 48), len: data.length });
    buffer = Buffer.concat([buffer, data]);
    if (buffer.length < 21) return;

    const version = buffer[0];
    events.unshift({ t: Date.now(), e: 'parse-uuid', clientUUID: Buffer.from(buffer.slice(1,17)).toString('hex'), serverUUID: serverUUID.toString('hex'), version });
    for (let i = 0; i < 16; i++) {
      if (buffer[1 + i] !== serverUUID[i]) { events.unshift({ t: Date.now(), e: 'ERR-uuid' }); ws.close(4002); return; }
    }
    const addInfoLen = buffer[17];
    const cmd = buffer[18];
    const port = buffer[19] * 256 + buffer[20];
    const addrType = buffer[21];

    let addr, addressEnd;
    if (addrType === 1) {
      const domainLen = buffer[22];
      addr = buffer.slice(23, 23 + domainLen).toString('utf8');
      addressEnd = 23 + domainLen;
    } else if (addrType === 2) {
      addr = `${buffer[22]}.${buffer[23]}.${buffer[24]}.${buffer[25]}`;
      addressEnd = 26;
    } else if (addrType === 3) {
      const parts = [];
      for (let i = 0; i < 8; i++) parts.push((buffer[22 + i*2]*256 + buffer[23 + i*2]).toString(16));
      addr = parts.join(':');
      addressEnd = 38;
    } else {
      events.unshift({ t: Date.now(), e: 'ERR-addrType' });
      ws.close(1002); return;
    }
    if (buffer.length < addressEnd + addInfoLen) return;

    const remaining = buffer.length > addressEnd + addInfoLen ? buffer.slice(addressEnd + addInfoLen) : null;
    buffer = Buffer.alloc(0);
    ws.removeListener('message', onMsg);

    events.unshift({ t: Date.now(), e: 'ok', target: addr + ':' + port, cmd: cmd });
    ws.send(Buffer.from([version, 0x00]), { binary: true });

    events.unshift({ t: Date.now(), e: 'connecting' });
    const dest = net.connect(port, addr, () => {
      events.unshift({ t: Date.now(), e: 'dest-connected', target: addr + ':' + port });
      if (remaining) dest.write(remaining);
    });
    dest.on('data', (c) => {
      events.unshift({ t: Date.now(), e: 'dest-data', len: c.length, hex: c.slice(0, 16).toString('hex') });
      if (ws.readyState === 1) ws.send(c, { binary: true });
    });
    dest.on('error', (e) => { events.unshift({ t: Date.now(), e: 'dest-err', msg: e.message }); ws.close(1011); });
    dest.on('end', () => { events.unshift({ t: Date.now(), e: 'dest-end' }); if (ws.readyState === 1) ws.close(); });

    ws.on('message', (c) => { if (dest.writable) dest.write(Buffer.isBuffer(c) ? c : Buffer.from(c)); });
    ws.on('close', () => { events.unshift({ t: Date.now(), e: 'ws-close' }); if (dest.writable) dest.end(); });
    ws.on('error', () => { if (dest.writable) dest.end(); });
  }

  ws.on('message', onMsg);
  ws.on('error', (e) => events.unshift({ t: Date.now(), e: 'ws-err', msg: e.message }));
});

server.listen(PORT, () => console.log(`VLESS+WS port=${PORT} uuid=${UUID} path=${WS_PATH}`));