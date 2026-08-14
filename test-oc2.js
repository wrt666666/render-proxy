const http = require('https');
const crypto = require('crypto');

// Real WebSocket key: 16 random bytes -> base64 (24 chars)
const validKey = crypto.randomBytes(16).toString('base64');

const req = http.request({
  hostname: 'proxy-burc.onrender.com',
  port: 443,
  path: '/vless-ws',
  method: 'GET',
  headers: {
    'Host': 'proxy-burc.onrender.com',
    'Upgrade': 'websocket',
    'Connection': 'Upgrade',
    'Sec-WebSocket-Key': validKey,
    'Sec-WebSocket-Version': '13',
  },
}, res => {
  console.log('STATUS:', res.statusCode);
  console.log('UPGRADE:', res.headers['upgrade']);
  console.log('CONNECTION:', res.headers['connection']);
  res.on('data', c => console.log('BODY:', c.slice(0, 50).toString('hex')));
  res.on('end', () => console.log('END'));
});
req.on('error', e => console.log('ERROR:', e.message));
req.setTimeout(10000, () => { req.destroy(); console.log('TIMEOUT (good: connection held open = WS upgrade accepted)'); });
req.end();