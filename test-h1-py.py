import ssl, socket, secrets

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
ctx.set_alpn_protocols(['http/1.1'])
raw = socket.create_connection(('proxy-burc.onrender.com', 443))
sock = ctx.wrap_socket(raw, server_hostname='proxy-burc.onrender.com')
print('ALPN:', sock.selected_alpn_protocol())

key = secrets.token_hex(16)[:24]
req = (
    f'GET /vless-ws HTTP/1.1\r\n'
    f'Host: proxy-burc.onrender.com\r\n'
    f'Upgrade: websocket\r\n'
    f'Connection: Upgrade\r\n'
    f'Sec-WebSocket-Key: {key}\r\n'
    f'Sec-WebSocket-Version: 13\r\n'
    f'User-Agent: mihomo/1.19.3\r\n'
    f'\r\n'
)
print('Request bytes:', len(req.encode()))
sock.sendall(req.encode())

sock.settimeout(3.0)
buf = b''
try:
    while True:
        d = sock.recv(4096)
        if not d: break
        buf += d
        if b'\r\n\r\n' in buf: break
except socket.timeout:
    pass

print('Response (first 500 bytes):')
print(buf[:500].decode('latin-1'))
sock.close()