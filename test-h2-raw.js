// Test what happens when OpenClash sends WebSocket headers over HTTP/2.
// Node's http2 client won't let us send Upgrade header, so we use raw http2 frames
// via a workaround: connect to CF, then send the raw pseudo-headers including upgrade.
const http2 = require('http2');
const tls = require('tls');
const crypto = require('crypto');

// Manual approach: build HTTP/2 frame with Upgrade pseudo-header stripped but
// actual header field preserved as pseudo. This is what Mihomo likely does.
// If CF returns 400 on h2 with upgrade, that's our root cause.

const socket = tls.connect(443, 'proxy-burc.onrender.com', {
  servername: 'proxy-burc.onrender.com',
  ALPNProtocols: ['h2'],
  rejectUnauthorized: false,
}, () => {
  const alpn = socket.alpnProtocol;
  console.log('ALPN:', alpn);
  if (alpn !== 'h2') {
    console.log('Not h2, try again with different ALPN');
    socket.destroy(); process.exit(0);
  }

  const session = http2.connect('https://proxy-burc.onrender.com', { socket, rejectUnauthorized: false });

  session.on('connect', () => {
    console.log('Session connected, ALPN:', session.alpnProtocol);
    const key = crypto.randomBytes(16).toString('base64');

    // Try with upgrade header as a regular header (some clients do this)
    // Node rejects at API level, so we try without the restricted headers
    const headers = {
      ':method': 'GET',
      ':path': '/vless-ws',
      ':authority': 'proxy-burc.onrender.com',
      'host': 'proxy-burc.onrender.com',
      'sec-websocket-key': key,
      'sec-websocket-version': '13',
      'user-agent': 'mihomo/1.0',
    };

    try {
      const req = session.request(headers);
      req.on('response', (h) => {
        console.log('STATUS:', h[':status']);
        console.log('upgrade:', h['upgrade']);
        console.log('server:', h['server']);
        req.resume();
        req.on('end', () => { session.close(); process.exit(0); });
      });
      req.on('error', (e) => {
        console.log('REQ ERROR:', e.code, e.message);
        session.close(); process.exit(0);
      });
      req.setTimeout(10000, () => { req.close(); session.close(); process.exit(0); });
      req.end();
    } catch(e) {
      console.log('CATCH:', e.code, e.message);
      session.close(); process.exit(0);
    }
  });

  session.on('error', (e) => { console.log('SESSION ERR:', e.code, e.message); process.exit(0); });
});

socket.on('error', (e) => { console.log('SOCKET ERR:', e.message); process.exit(0); });