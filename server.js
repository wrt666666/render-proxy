const http = require('http');
const httpProxy = require('http-proxy');
const { URL } = require('url');

const proxy = httpProxy.createProxyServer({ ws: true });
const PORT = process.env.PORT || 3000;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

function getAuthToken(req) {
  const auth = req.headers['authorization'];
  if (!auth) return null;
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  if (auth.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(auth.slice(6), 'base64').toString();
      const parts = decoded.split(':');
      return parts[1] || parts[0]; // password 或 username
    } catch { return null; }
  }
  return null;
}

const server = http.createServer();

server.on('request', (req, res) => {
  // 健康检查
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      uptime: process.uptime(),
      target: process.env.PROXY_TARGET,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // 认证检查
  if (AUTH_TOKEN) {
    const token = getAuthToken(req);
    if (token !== AUTH_TOKEN) {
      res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Basic realm="proxy"' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
  }

  // 支持 ?url= 参数指定目标
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const target = parsed.searchParams.get('url')
    || process.env.PROXY_TARGET
    || 'https://www.google.com';

  // 记录日志
  const ts = new Date().toISOString();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`[${ts}] ${req.method} ${req.url} -> ${target}  (from ${ip})`);

  proxy.web(req, res, {
    target,
    changeOrigin: true,
    timeout: 30000
  });
});

// WebSocket 代理
server.on('upgrade', (req, socket, head) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const target = parsed.searchParams.get('url')
    || process.env.PROXY_TARGET
    || 'wss://localhost';

  proxy.ws(req, socket, head, { target });
});

proxy.on('error', (err, req, res) => {
  console.error(`Proxy error: ${err.message}`);
  if (!res.headersSent && req) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Gateway', message: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Proxy server on port ${PORT}`);
  console.log(`Target: ${process.env.PROXY_TARGET || 'default'}`);
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });