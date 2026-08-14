const http = require('https');

// Exactly what OpenClash sends for VLESS+WS: path = /vless-ws, no auth headers, Host header.
const req = http.request({
  hostname: 'proxy-burc.onrender.com',
  port: 443,
  path: '/vless-ws',
  method: 'GET',
  headers: {
    'Host': 'proxy-burc.onrender.com',
    'Upgrade': 'websocket',
    'Connection': 'Upgrade',
    'Sec-WebSocket-Key': Buffer.from('openclash2026').toString('base64'),
    'Sec-WebSocket-Version': '13',
    'Sec-WebSocket-Protocol': 'Gun'
  },
}, res => {
  console.log('STATUS:', res.statusCode);
  console.log('HEADERS:', JSON.stringify(res.headers, null, 2));
  res.on('data', c => console.log('BODY BYTES:', c.length, Buffer.from(c).slice(0, 50).toString('hex')));
  res.on('end', () => console.log('END'));
});
req.on('error', e => console.log('ERROR:', e.message));
req.setTimeout(15000, () => { req.destroy(); console.log('TIMEOUT'); });
req.end();