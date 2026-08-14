const http = require('https');

const tests = [
  { name: 'plain GET (no upgrade headers)', headers: { 'Host': 'proxy-burc.onrender.com' } },
  { name: 'WS upgrade (no protocol)', headers: {
      'Host': 'proxy-burc.onrender.com',
      'Upgrade': 'websocket',
      'Connection': 'Upgrade',
      'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
      'Sec-WebSocket-Version': '13'
  }},
  { name: 'WS upgrade with Sec-WebSocket-Protocol', headers: {
      'Host': 'proxy-burc.onrender.com',
      'Upgrade': 'websocket',
      'Connection': 'Upgrade',
      'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
      'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Protocol': 'Gun'
  }},
  { name: 'double-slash path', path: '//vless-ws', headers: {
      'Host': 'proxy-burc.onrender.com',
      'Upgrade': 'websocket',
      'Connection': 'Upgrade',
      'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
      'Sec-WebSocket-Version': '13'
  }}
];

for (const t of tests) {
  const req = http.request({
    hostname: 'proxy-burc.onrender.com',
    port: 443,
    path: t.path || '/vless-ws',
    method: 'GET',
    headers: t.headers,
  }, res => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => {
      console.log(`--- ${t.name} (${t.path || '/vless-ws'})`);
      console.log(`  status: ${res.statusCode}`);
      console.log(`  headers:`, JSON.stringify(res.headers));
      console.log(`  body: ${body.slice(0, 200)}`);
      console.log();
    });
  });
  req.on('error', e => console.log(`${t.name} ERROR: ${e.message}`));
  req.end();
}