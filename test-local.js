const WebSocket = require('ws');
const { spawn } = require('child_process');

const server = spawn('node', ['server.js'], {
  env: { ...process.env, PORT: '9998', UUID: 'b46b7b0579d1405cb6f2ce73e8ffbe48', WS_PATH: '/vless-ws' },
  cwd: __dirname,
  stdio: ['ignore', 'pipe', 'pipe']
});
server.stdout.on('data', (d) => console.log('SVC:', d.toString().trim()));
server.stderr.on('data', (d) => console.error('SVCERR:', d.toString().trim()));

setTimeout(() => {
  const UUID = 'b46b7b0579d1405cb6f2ce73e8ffbe48';
  // Exactly as Xray sends: version(1) + uuid(16) + addInfoLen(1) + cmd(1) + port(2) + addrType(1) + domainLen(1) + domain(14)
  const buf = Buffer.from('00b46b7b0579d1405cb6f2ce73e8ffbe48000101bb020e7777772e676f6f676c652e636f6d', 'hex');
  console.log('send hex:', buf.toString('hex'), 'len:', buf.length);
  const ws = new WebSocket('ws://127.0.0.1:9998/vless-ws');
  ws.on('open', () => { ws.send(buf, { binary: true }); });
  ws.on('message', (d) => { console.log('RESP:', d.toString('hex')); ws.close(); server.kill(); process.exit(0); });
  ws.on('error', (e) => { console.log('ERR:', e.message); server.kill(); process.exit(1); });
  setTimeout(() => { console.log('TIMEOUT'); server.kill(); process.exit(0); }, 4000);
}, 1500);