const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const net = require('net');

const PORT = process.env.PORT || 3000;
const UUID = (process.env.UUID || crypto.randomUUID()).replace(/-/g, '');
const WS_PATH = process.env.WS_PATH || '/vless-ws';

const serverUUID = Buffer.from(UUID, 'hex');
const events = [];

const server = http.createServer((req, res) => {
  events.unshift({ t: Date.now(), e: 'http', url: req.url });
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uuid: UUID, path: WS_PATH }));
    return;
  }
  if (req.url === '/debug') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ events: events.slice(0, 30) }));
    return;
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({ server, verifyClient: (info, cb) => {
  events.unshift({ t: Date.now(), e: 'verifyClient', path: info.req.url, origin: info.req.headers['origin'] });
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
    for (let i = 0; i < 16; i++) {
      if (buffer[1 + i] !== serverUUID[i]) { events.unshift({ t: Date.now(), e: 'ERR-uuid' }); ws.close(1002); return; }
    }
    const addInfoLen = buffer[17];
    const cmd = buffer[18];
    const port = buffer[19] * 256 + buffer[20];
    const addrType = buffer[21];
    let addrLen = addrType === 1 ? 4 : (addrType === 3 ? 16 : 1 + buffer[22]);
    const addrStart = addrType === 2 ? 23 : 22;
    const addInfoStart = addrStart + addrLen;
    if (buffer.length < addInfoStart + addInfoLen) return;

    let addr;
    if (addrType === 1) addr = buffer.slice(addrStart, addrStart + 4).join('.');
    else if (addrType === 2) addr = buffer.slice(addrStart + 1, addrStart + 1 + buffer[22]).toString();
    else addr = '[ipv6]';

    const remaining = buffer.length > addInfoStart + addInfoLen ? buffer.slice(addInfoStart + addInfoLen) : null;
    buffer = Buffer.alloc(0);
    ws.removeListener('message', onMsg);

    events.unshift({ t: Date.now(), e: 'ok', target: addr + ':' + port });
    ws.send(Buffer.from([version, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), { binary: true });

    const dest = net.connect(port, addr, () => { if (remaining) dest.write(remaining); });
    dest.on('data', (c) => { if (ws.readyState === 1) ws.send(c, { binary: true }); });
    dest.on('error', (e) => { events.unshift({ t: Date.now(), e: 'dest-err', msg: e.message }); ws.close(1011); });
    dest.on('end', () => { if (ws.readyState === 1) ws.close(); });

    ws.on('message', (c) => { if (dest.writable) dest.write(Buffer.isBuffer(c) ? c : Buffer.from(c)); });
    ws.on('close', () => { events.unshift({ t: Date.now(), e: 'ws-close' }); if (dest.writable) dest.end(); });
    ws.on('error', () => { if (dest.writable) dest.end(); });
  }

  ws.on('message', onMsg);
  ws.on('error', (e) => events.unshift({ t: Date.now(), e: 'ws-err', msg: e.message }));
});

server.listen(PORT, () => console.log(`VLESS+WS port=${PORT} uuid=${UUID} path=${WS_PATH}`));