# Systematic test: find which header causes CF to return 400
import ssl, socket, secrets, base64

def connect(alpn):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    ctx.set_alpn_protocols(alpn)
    raw = socket.create_connection(('proxy-burc.onrender.com', 443))
    return ctx.wrap_socket(raw, server_hostname='proxy-burc.onrender.com'), raw

def send_test(name, alpn, path, headers_lines, extra=''):
    print(f'\n=== {name} (alpn={alpn[0]}) ===')
    try:
        sock, raw = connect(alpn)
        print('  ALPN:', sock.selected_alpn_protocol())
        req = (
            f'GET {path} HTTP/1.1\r\n'
            f'Host: proxy-burc.onrender.com\r\n'
        )
        for h in headers_lines:
            req += f'{h}\r\n'
        req += f'\r\n'
        sock.sendall(req.encode())
        sock.settimeout(2.0)
        buf = b''
        try:
            while True:
                d = sock.recv(4096)
                if not d: break
                buf += d
                if b'\r\n\r\n' in buf: break
        except socket.timeout:
            buf += b'\n[TIMEOUT = WS held open]'
        first_line = buf.split(b'\r\n')[0].decode('latin-1') if buf else 'EMPTY'
        print(' ', first_line[:120])
        sock.close()
    except Exception as e:
        print('  ERR:', e)

# Generate valid Sec-WebSocket-Key: 16 bytes -> base64 (24 chars, std alphabet)
valid_key = base64.b64encode(secrets.token_bytes(16)).decode()
invalid_key = 'dGhlIHNhbXBsZSBub25jZQ=='  # 22 chars, not 24 (missing ==)
print(f'valid_key: {valid_key} len={len(valid_key)}')
print(f'invalid_key: {invalid_key} len={len(invalid_key)}')

# Test 1: minimal valid headers
send_test('1. valid', ['http/1.1'], '/vless-ws', [
    'Upgrade: websocket', 'Connection: Upgrade',
    f'Sec-WebSocket-Key: {valid_key}', 'Sec-WebSocket-Version: 13',
])

# Test 2: lowercase connection (CF requirement)
send_test('2. lowercase connection', ['http/1.1'], '/vless-ws', [
    'Upgrade: websocket', 'Connection: upgrade',
    f'Sec-WebSocket-Key: {valid_key}', 'Sec-WebSocket-Version: 13',
])

# Test 3: invalid key (22 chars)
send_test('3. short key', ['http/1.1'], '/vless-ws', [
    'Upgrade: websocket', 'Connection: upgrade',
    f'Sec-WebSocket-Key: {invalid_key}', 'Sec-WebSocket-Version: 13',
])

# Test 4: missing sec-websocket-key
send_test('4. no key', ['http/1.1'], '/vless-ws', [
    'Upgrade: websocket', 'Connection: upgrade',
    'Sec-WebSocket-Version: 13',
])

# Test 5: Sec-WebSocket-Protocol: Gun (Mihomo default)
send_test('5. with Gun protocol', ['http/1.1'], '/vless-ws', [
    'Upgrade: websocket', 'Connection: Upgrade, Sec-WebSocket-Protocol',
    f'Sec-WebSocket-Key: {valid_key}', 'Sec-WebSocket-Version: 13',
    'Sec-WebSocket-Protocol: Gun',
])

# Test 6: Connection header with both
send_test('6. connection both', ['http/1.1'], '/vless-ws', [
    'Upgrade: websocket', 'Connection: upgrade, Sec-WebSocket-Protocol',
    f'Sec-WebSocket-Key: {valid_key}', 'Sec-WebSocket-Version: 13',
    'Sec-WebSocket-Protocol: Gun',
])