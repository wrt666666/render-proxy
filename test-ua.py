import ssl, socket, secrets, base64

def probe(name, headers_dict, ua):
    print(f'\n=== {name} (ua={ua!r}) ===')
    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    ctx.set_alpn_protocols(['http/1.1'])
    s = ctx.wrap_socket(socket.create_connection(('proxy-burc.onrender.com', 443)), server_hostname='proxy-burc.onrender.com')
    key = base64.b64encode(secrets.token_bytes(16)).decode()
    req = f'GET /vless-ws HTTP/1.1\r\nHost: proxy-burc.onrender.com\r\n'
    if ua:
        req += f'User-Agent: {ua}\r\n'
    req += 'Upgrade: websocket\r\nConnection: Upgrade\r\n'
    req += f'Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n'
    for k, v in headers_dict.items():
        req += f'{k}: {v}\r\n'
    req += '\r\n'
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
    print(' ', first[:100])
    s.close()

probe('no-ua-no-protocol', {}, None)
probe('ua-Chrome', {}, 'Mozilla/5.0 Chrome')
probe('ua-Clash', {}, 'Clash')
probe('ua-ClashMeta', {}, 'Clash Meta')
probe('ua-empty', {}, '')
probe('with-Gun', {'Sec-WebSocket-Protocol':'Gun'}, None)
probe('ua-Clash-with-Gun', {'Sec-WebSocket-Protocol':'Gun'}, 'Clash')