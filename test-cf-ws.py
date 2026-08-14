import ssl, socket, secrets, base64

def probe(name, alpn, path, headers, timeout=2.5):
    print(f'\n=== {name} ===')
    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    ctx.set_alpn_protocols(alpn)
    s = ctx.wrap_socket(socket.create_connection(('proxy-burc.onrender.com', 443)), server_hostname='proxy-burc.onrender.com')
    print('  ALPN:', s.selected_alpn_protocol())
    req = f'GET {path} HTTP/1.1\r\nHost: proxy-burc.onrender.com\r\n'
    for k, v in headers:
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
        buf += b'\n[TIMEOUT=101 held]'
    first = buf.split(b'\r\n')[0].decode('latin-1') if buf else 'EMPTY'
    print(' ', first[:100])
    s.close()
    return first

key = base64.b64encode(secrets.token_bytes(16)).decode()
base = [('Upgrade','websocket'),('Connection','upgrade'),(f'Sec-WebSocket-Key',key),('Sec-WebSocket-Version','13')]

# 1. valid
probe('1. full valid', ['http/1.1'], '/vless-ws', base)
# 2. no Sec-WebSocket-Key (mihomo?)
probe('2. NO Sec-WebSocket-Key', ['http/1.1'], '/vless-ws', [('Upgrade','websocket'),('Connection','upgrade'),('Sec-WebSocket-Version','13')])
# 3. with Sec-WebSocket-Protocol: Gun
probe('3. + Gun protocol', ['http/1.1'], '/vless-ws', base + [('Sec-WebSocket-Protocol','Gun')])
# 4. only Upgrade: websocket (no version)
probe('4. no version', ['http/1.1'], '/vless-ws', [('Upgrade','websocket'),('Connection','upgrade'),(f'Sec-WebSocket-Key',key)])
# 5. Sec-WebSocket-Key malformed
probe('5. bad key', ['http/1.1'], '/vless-ws', [('Upgrade','websocket'),('Connection','upgrade'),('Sec-WebSocket-Key','invalid!!'),('Sec-WebSocket-Version','13')])