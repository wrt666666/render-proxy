import ssl, socket, h2.connection, h2.config, h2.events, secrets

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
ctx.set_alpn_protocols(['h2'])
raw = socket.create_connection(('proxy-burc.onrender.com', 443))
sock = ctx.wrap_socket(raw, server_hostname='proxy-burc.onrender.com')
print('ALPN:', sock.selected_alpn_protocol())

conn = h2.connection.H2Connection(config=h2.config.H2Configuration(header_encoding='utf-8'))
conn.initiate_connection()
sock.sendall(conn.data_to_send())

headers = [
    (':method', 'GET'), (':path', '/vless-ws'),
    (':authority', 'proxy-burc.onrender.com'), (':scheme', 'https'),
    ('host', 'proxy-burc.onrender.com'),
    ('upgrade', 'websocket'), ('connection', 'upgrade'),
    ('sec-websocket-key', secrets.token_hex(16)[:24]),
    ('sec-websocket-version', '13'),
    ('user-agent', 'mihomo/1.19.3'),
]
conn.send_headers(conn.get_next_available_stream_id(), headers, end_stream=True)
sock.sendall(conn.data_to_send())
print('HEADERS sent')

import time
start = time.time()
sock.settimeout(2.0)
while time.time() - start < 12:
    try:
        data = sock.recv(4096)
    except socket.timeout:
        break
    if not data:
        break
    for ev in conn.receive_data(data):
        print(f'EVENT: {type(ev).__name__}')
        if hasattr(ev, 'headers'):
            print('  headers:', dict(ev.headers))
        if hasattr(ev, 'data'):
            print('  data:', ev.data[:80])
        if hasattr(ev, 'error_code'):
            print('  error_code:', ev.error_code)

print('done')
sock.close()