const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const net = require('net');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const UUID = 'b46b7b0579d1405cb6f2ce73e8ffbe48';
const WS_PATH = process.env.WS_PATH || '/vless-ws';
const LOG_PATH = '/tmp/server-logs.jsonl';
const MAX_LOG_LINES = 200;

function log(e) {
  const obj = { t: Date.now(), ...e };
  const line = JSON.stringify(obj);
  try {
    fs.appendFileSync(LOG_PATH, line + '\n');
    let lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
    if (lines.length > MAX_LOG_LINES) {
      fs.writeFileSync(LOG_PATH, lines.slice(-MAX_LOG_LINES).join('\n') + '\n');
    }
  } catch(err) { /* best-effort */ }
}

const serverUUID = Buffer.from(UUID, 'hex');
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  log({ e: 'http', url: req.url, ua: req.headers['user-agent'], upgrade: req.headers['upgrade'], proto: req.socket && req.socket.getProtocol ? req.socket.getProtocol() : null, cipher: req.socket && req.socket.getCipher ? (req.socket.getCipher() && req.socket.getCipher().name || null) : null });

  if (u.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uuid: UUID, path: WS_PATH }));
    return;
  }
  if (u.pathname === '/debug') {
    const n = parseInt(u.searchParams.get('n') || '50');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    try {
      const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).slice(0, n);
      res.end(JSON.stringify({ events: lines }));
    } catch(err) {
      res.end(JSON.stringify({ events: [], err: err.message }));
    }
    return;
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({
  server,
  handleProtocols: (req, available) => available[0],
  verifyClient: (info, cb) => {
    log({ e: 'verifyClient', url: info.req.url, ua: info.req.headers['user-agent'], swsproto: info.req.headers['sec-websocket-protocol'], hasKey: !!info.req.headers['sec-websocket-key'], hasVersion: !!info.req.headers['sec-websocket-version'], conn: info.req.headers['connection'], upgrade: info.req.headers['upgrade'] });
    cb(true);
  }
});

wss.on('connection', (ws, req) => {
  log({ e: 'ws-connect', path: req.url });
  let buffer = Buffer.alloc(0);

  function onMsg(msg) {
    const data = Buffer.isBuffer(msg) ? msg : Buffer.from(msg);
    log({ e: 'msg', hex: data.toString('hex').slice(0, 64), len: data.length });
    buffer = Buffer.concat([buffer, data]);
    if (buffer.length < 21) return;

    const version = buffer[0];
    const clientUUID = Buffer.from(buffer.slice(1, 17)).toString('hex');
    log({ e: 'parse-uuid', clientUUID, serverUUID: serverUUID.toString('hex'), version });
    for (let i = 0; i < 16; i++) {
      if (buffer[1 + i] !== serverUUID[i]) {
        log({ e: 'ERR-uuid' });
        ws.close(4002);
        return;
      }
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
      log({ e: 'ERR-addrType', val: addrType });
      ws.close(1002); return;
    }
    if (buffer.length < addressEnd + addInfoLen) return;

    const remaining = buffer.length > addressEnd + addInfoLen ? buffer.slice(addressEnd + addInfoLen) : null;
    buffer = Buffer.alloc(0);
    ws.removeListener('message', onMsg);

    log({ e: 'ok', target: addr + ':' + port, cmd });
    ws.send(Buffer.from([version, 0x00]), { binary: true });

    log({ e: 'connecting' });
    const dest = net.connect(port, addr, () => {
      log({ e: 'dest-connected', target: addr + ':' + port });
      if (remaining) dest.write(remaining);
    });
    dest.on('data', (c) => {
      log({ e: 'dest-data', len: c.length, hex: c.slice(0, 16).toString('hex') });
      if (ws.readyState === 1) ws.send(c, { binary: true });
    });
    dest.on('error', (e) => { log({ e: 'dest-err', msg: e.message }); ws.close(1011); });
    dest.on('end', () => { log({ e: 'dest-end' }); if (ws.readyState === 1) ws.close(); });

    ws.on('message', (c) => { if (dest.writable) dest.write(Buffer.isBuffer(c) ? c : Buffer.from(c)); });
    ws.on('close', () => { log({ e: 'ws-close' }); if (dest.writable) dest.end(); });
    ws.on('error', () => { if (dest.writable) dest.end(); });
  }

  ws.on('message', onMsg);
  ws.on('error', (e) => log({ e: 'ws-err', msg: e.message }));
});

server.listen(PORT, () => console.log(`VLESS+WS port=${PORT} uuid=${UUID} path=${WS_PATH}`));