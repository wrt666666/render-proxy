import ssl, socket, secrets, base64

def probe(name, extra_headers, ua=None):
    print(f'\n=== {name} ===')
    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    ctx.set_alpn_protocols(['http/1.1'])
    s = ctx.wrap_socket(socket.create_connection(('proxy-burc.onrender.com', 443)), server_hostname='proxy-burc.onrender.com')
    key = base64.b64encode(secrets.token_bytes(16)).decode()
    req = 'GET /vless-ws HTTP/1.1\r\nHost: proxy-burc.onrender.com\r\n'
    if ua is not None:
        req += f'User-Agent: {ua}\r\n'
    # Mihomo default: Connection: Upgrade, Sec-WebSocket-Protocol
    req += 'Upgrade: websocket\r\n'
    req += 'Connection: Upgrade, Sec-WebSocket-Protocol\r\n'
    req += f'Sec-WebSocket-Key: {key}\r\n'
    req += 'Sec-WebSocket-Version: 13\r\n'
    req += 'Sec-WebSocket-Protocol: Gun\r\n'
    for k, v in extra_headers.items():
        req += f'{k}: {v}\r\n'
    req += '\r\n'
    print('  Request:\n' + ''.join(f'  {line}\r\n' for line in req.split('\r\n')))
    s.sendall(req.encode())
    s.settimeout(2.5)
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
    print('  ', first[:120])
    s.close()

probe('mihomo default (with Gun)', {})
probe('mihomo + Chrome UA', {}, ua='Mozilla/5.0')
probe('no Gun protocol', {'Connection': 'Upgrade'})