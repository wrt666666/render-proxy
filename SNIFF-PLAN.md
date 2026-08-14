const http = require('http');
const net = require('net');

// HTTP sniffer: listens on Render port, prints raw request, then proxies to real service.
// Actually simpler: just log every request on the server itself via debug endpoint.
// But OpenClash WS requests never reach server. So add a middleware that logs to stderr
// via an additional endpoint triggered by every connection.