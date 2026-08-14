const http = require('https');
const crypto = require('crypto');

// Exact WebSocket upgrade as OpenClash sends (no auth, no Sec-WebSocket-Protocol)
const key = crypto.randomBytes(16).toString('base64');

const req = http.request({
  hostname: 'proxy-burc.onrender.com',
  port: 443,
  path: '/vless-ws',
  method: 'GET',
  headers: {
    'Host': 'proxy-burc.onrender.com',
    'Upgrade': 'websocket',
    'Connection': 'Upgrade',
    'Sec-WebSocket-Key': key,
    'Sec-WebSocket-Version': '13',
  },
}, res => {
  console.log('STATUS:', res.statusCode);
  console.log('server:', res.headers['server']);
  console.log('cf-cache-status:', res.headers['cf-cache-status']);
  console.log('upgrade:', res.headers['upgrade']);
  res.on('data', c => console.log('BODY:', Buffer.from(c).slice(0, 60).toString('utf8').replace(/\n/g,'\\n')));
  res.on('end', () => { console.log('END'); process.exit(0); });
});
req.on('error', e => { console.log('ERROR:', e.message); process.exit(0); });
req.setTimeout(12000, () => { req.destroy(); console.log('TIMEOUT=WS upgrade OK, connection held'); process.exit(0); });
req.end();