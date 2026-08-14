import ssl, socket, secrets, base64

def probe(name, path, extra_headers, timeout=2.5):
    print(f'\n=== {name} ===')
    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    ctx.set_alpn_protocols(['http/1.1'])
    s = ctx.wrap_socket(socket.create_connection(('proxy-burc.onrender.com', 443)), server_hostname='proxy-burc.onrender.com')
    key = base64.b64encode(secrets.token_bytes(16)).decode()
    req = (
        f'GET {path} HTTP/1.1\r\n'
        f'Host: proxy-burc.onrender.com\r\n'
        f'User-Agent: Clash\rf\n'
        f'Upgrade: websocket\r\n'
        f'Connection: Upgrade\r\n'
        f'Sec-WebSocket-Key: {key}\r\n'
        f'Sec-WebSocket-Version: 13\r\n'
    )
    for k, v in extra_headers:
        req += f'{k}: {v}\r\n'
    req += '\r\n'
    s.sendall(req.encode())
    s.settimeout(timeout)
    buf = b''
    try:
        while True:
            d = s.recv(4096)
            if not d: break
            buf += d
            if b'\r\n\r\n' in buf: break
    except socket.timeout:
        buf += b'\n[TIMEOUT=101]'
    first = buf.split(b'\r\n')[0].decode('latin-1') if buf else 'EMPTY'
    print(' ', first[:120])
    s.close()

# Mihomo sends Sec-WebSocket-Protocol: Gun by default
probe('1. full mihomo', '/vless-ws', [('Sec-WebSocket-Protocol','Gun')])
# Try no User-Agent (maybe Mihomo doesn't send it)
probe('2. no ua', '/vless-ws', [('Sec-WebSocket-Protocol','Gun')], )
# Try with path from debug log: //vless-ws (double slash, seen in earlier debug)
probe('3. double-slash path', '//vless-ws', [('Sec-WebSocket-Protocol','Gun')])