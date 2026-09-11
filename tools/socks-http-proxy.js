// HTTP CONNECT -> SOCKS5 桥接代理（v3：用 pipe 处理 backpressure）
// 用法: node tools/socks-http-proxy.js <listen-port>

const net = require('net');

const LISTEN_PORT = parseInt(process.argv[2] || '7893', 10);
const SOCKS5_HOST = process.env.SOCKS5_HOST || '127.0.0.1';
const SOCKS5_PORT = parseInt(process.env.SOCKS5_PORT || '7892', 10);

const VER = 0x05;
const AUTH_NONE = 0x00;
const CMD_CONNECT = 0x01;
const ATYP_IPV4 = 0x01;
const ATYP_DOMAIN = 0x03;

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

// 调高 socket 缓冲区上限（默认 16 KB，对大流量推 push 不够）
net.Socket.prototype.setNoDelay = net.Socket.prototype.setNoDelay || function () {};

// 通过 SOCKS5 与 host:port 建立 TCP 连接（callback(err, socket)）
function socks5Connect(host, port, cb) {
  const sock = net.createConnection({
    host: SOCKS5_HOST,
    port: SOCKS5_PORT,
    // 让内核 socket 缓冲区更大一些
    highWaterMark: 1024 * 1024,
  });
  sock.setNoDelay(true);
  sock.setKeepAlive(true, 30000);

  let stage = 0;

  sock.once('error', (err) => {
    log('socks5 socket err:', err.message);
    cb(err);
  });

  sock.on('connect', () => {
    // 1. 握手
    sock.write(Buffer.from([VER, 1, AUTH_NONE]));
  });

  sock.on('data', (chunk) => {
    if (stage === 0) {
      if (chunk.length < 2 || chunk[0] !== VER || chunk[1] !== AUTH_NONE) {
        sock.destroy();
        cb(new Error(`handshake failed: ${chunk.toString('hex')}`));
        return;
      }
      stage = 1;
      // 2. 发 CONNECT 请求
      let req;
      if (net.isIP(host) === 4) {
        const ip = Buffer.alloc(4);
        host.split('.').forEach((o, i) => (ip[i] = Number(o)));
        req = Buffer.concat([Buffer.from([VER, CMD_CONNECT, 0, ATYP_IPV4]), ip]);
      } else {
        const domainBuf = Buffer.from(host);
        req = Buffer.concat([Buffer.from([VER, CMD_CONNECT, 0, ATYP_DOMAIN, domainBuf.length]), domainBuf]);
      }
      const portBuf = Buffer.alloc(2);
      portBuf.writeUInt16BE(port, 0);
      sock.write(Buffer.concat([req, portBuf]));
    } else if (stage === 1) {
      if (chunk.length < 4 || chunk[0] !== VER || chunk[1] !== 0x00) {
        sock.destroy();
        cb(new Error(`connect refused: code=${chunk[1]} hex=${chunk.toString('hex')}`));
        return;
      }
      stage = 2;
      sock.removeAllListeners('data');
      cb(null, sock);
    }
  });
}

// 双向 pipe，end/error 互相清理
function link(a, b) {
  let ended = false;
  const done = (who, reason) => {
    if (ended) return;
    ended = true;
    log(`link end: ${who} (${reason || ''})`);
    try { a.destroy(); } catch (_) {}
    try { b.destroy(); } catch (_) {}
  };
  a.on('error', (e) => done('a err', e.message));
  b.on('error', (e) => done('b err', e.message));
  a.on('end', () => done('a end'));
  b.on('end', () => done('b end'));
  a.on('close', () => done('a close'));
  b.on('close', () => done('b close'));
  // 用 pipe 让 Node 自动处理 backpressure
  a.pipe(b);
  b.pipe(a);
}

// 启动服务
const server = net.createServer({
  // 高水位线 1 MB，对 push 大流量更友好
  highWaterMark: 1024 * 1024,
}, (client) => {
  let pendingBytes = Buffer.alloc(0);
  let target = null;
  let headerFinished = false;

  client.setNoDelay(true);
  client.setKeepAlive(true, 30000);

  client.once('error', (err) => {
    if (!headerFinished) log('client early err:', err.message);
    if (target) target.destroy();
    client.destroy();
  });

  client.on('data', (chunk) => {
    if (target) {
      // header 已解析完成 + 已建链：所有数据直接转发给 target
      target.write(chunk);
      return;
    }
    pendingBytes = Buffer.concat([pendingBytes, chunk]);
    const headerEnd = pendingBytes.indexOf('\r\n\r\n');
    if (headerEnd === -1) return;

    const headStr = pendingBytes.slice(0, headerEnd).toString('ascii');
    const lines = headStr.split('\r\n');
    const first = lines[0];
    const m = /^CONNECT\s+([^:\s]+):(\d+)\s+HTTP/i.exec(first);
    if (!m) {
      log('not CONNECT:', first);
      client.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      client.destroy();
      return;
    }
    const host = m[1];
    const port = parseInt(m[2], 10);
    headerFinished = true;
    log(`CONNECT ${host}:${port}`);

    const afterHeader = pendingBytes.slice(headerEnd + 4);
    pendingBytes = null;

    socks5Connect(host, port, (err, sock) => {
      if (err) {
        log('socks5 err:', err.message);
        client.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
        client.destroy();
        return;
      }
      target = sock;
      client.write('HTTP/1.1 200 Connection Established\r\nProxy-Agent: node-socks-bridge-v3\r\n\r\n');
      if (afterHeader.length > 0) sock.write(afterHeader);
      // 用 pipe 处理双向转发 + backpressure
      link(client, sock);
    });
  });
});

server.listen(LISTEN_PORT, '127.0.0.1', () => {
  log(`SOCKS5-HTTP bridge v3 listening on 127.0.0.1:${LISTEN_PORT} -> socks5://${SOCKS5_HOST}:${SOCKS5_PORT}`);
});

process.on('SIGINT', () => { log('SIGINT'); server.close(); process.exit(0); });