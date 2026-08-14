const http = require('https');
const crypto = require('crypto');

// Exactly what OpenClash/Mihomo sends for VLESS+WS (no auth headers):
const key = crypto.randomBytes(16).toString('base64');
console.log('Key:', key, '(len', key.length, ')');

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
  console.log('upgrade:', res.headers['upgrade']);
  console.log('connection:', res.headers['connection']);
  console.log('all:', JSON.stringify(res.headers));
  res.on('data', c => console.log('BODY hex:', Buffer.from(c).slice(0, 80).toString('hex')));
  res.on('end', () => console.log('END'));
});
req.on('error', e => console.log('ERROR:', e.message));
req.setTimeout(8000, () => { req.destroy(); console.log('TIMEOUT=WS held open'); });
req.end();