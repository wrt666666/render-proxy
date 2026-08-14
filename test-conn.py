import ssl, socket, secrets, base64

def probe(name, connection_header, upgrade='websocket'):
    print(f'\n=== {name} ===')
    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    ctx.set_alpn_protocols(['http/1.1'])
    s = ctx.wrap_socket(socket.create_connection(('proxy-burc.onrender.com', 443)), server_hostname='proxy-burc.onrender.com')
    key = base64.b64encode(secrets.token_bytes(16)).decode()
    req = (
        f'GET /vless-ws HTTP/1.1\r\n'
        f'Host: proxy-burc.onrender.com\r\n'
        f'Upgrade: {upgrade}\r\n'
        f'Connection: {connection_header}\r\n'
        f'Sec-WebSocket-Key: {key}\r\n'
        f'Sec-WebSocket-Version: 13\r\n'
    )
    if 'Sec-WebSocket-Protocol' in connection_header:
        req += 'Sec-WebSocket-Protocol: Gun\r\n'
    req += '\r\n'
    print('  Connection:', repr(connection_header))
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

# Standard
probe('1. Upgrade only', 'Upgrade')
probe('2. Uppercase', 'Upgrade')
probe('3. lowercase', 'upgrade')
probe('4. both tokens', 'Upgrade, Sec-WebSocket-Protocol')
probe('5. both lowercase', 'upgrade, Sec-WebSocket-Protocol')
probe('6. just connection empty', 'close')