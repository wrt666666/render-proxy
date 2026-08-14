const http2 = require('http2');
const crypto = require('crypto');

// Force HTTP/2 CONNECT to proxy-burc.onrender.com and do WS upgrade
const session = http2.connect('https://proxy-burc.onrender.com', {
  rejectUnauthorized: false
});

session.on('connect', () => {
  console.log('ALPN negotiated:', session.alpnProtocol);
  const key = crypto.randomBytes(16).toString('base64');
  const req = session.request({
    ':method': 'GET',
    ':path': '/vless-ws',
    ':authority': 'proxy-burc.onrender.com',
    'host': 'proxy-burc.onrender.com',
    'upgrade': 'websocket',
    'connection': 'upgrade',
    'sec-websocket-key': key,
    'sec-websocket-version': '13',
  });

  req.on('response', (headers) => {
    console.log('STATUS:', headers[':status']);
    console.log('upgrade:', headers['upgrade']);
    console.log('server:', headers['server']);
    console.log('all:', JSON.stringify(headers));
    req.resume();
    req.on('end', () => { session.close(); process.exit(0); });
  });

  req.on('error', (e) => {
    console.log('ERROR:', e.code, e.message);
    session.close(); process.exit(0);
  });

  req.setTimeout(10000, () => { req.close(); session.close(); console.log('TIMEOUT'); process.exit(0); });
  req.end();
});

session.on('error', (e) => { console.log('SESSION ERROR:', e.message); process.exit(0); });