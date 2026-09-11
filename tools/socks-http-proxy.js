// HTTP CONNECT -> SOCKS5 桥接代理
// 用法: node tools/socks-http-proxy.js <listen-port>
// 例:   node tools/socks-http-proxy.js 7893
//
// 客户端发送 HTTP CONNECT host:port 后，所有流量通过 SOCKS5 (127.0.0.1:7892) 转发。

const net = require('net');

const LISTEN_PORT = parseInt(process.argv[2] || '7893', 10);
const SOCKS5_HOST = process.env.SOCKS5_HOST || '127.0.0.1';
const SOCKS5_PORT = parseInt(process.env.SOCKS5_PORT || '7892', 10);

const VER = 0x05;
const AUTH_NONE = 0x00;
const CMD_CONNECT = 0x01;
const ATYP_IPV4 = 0x01;
const ATYP_DOMAIN = 0x03;
const ATYP_IPV6 = 0x04;

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

// 通过 SOCKS5 建立到 host:port 的 TCP 连接
function socks5Connect(host, port, cb) {
  const sock = net.connect(SOCKS5_PORT, SOCKS5_HOST, () => {
    // 1. 握手
    sock.write(Buffer.from([VER, 1, AUTH_NONE]));
  });

  let stage = 0; // 0=等握手回应 1=等连接回应

  sock.once('error', (err) => {
    log('socks5 socket err:', err.message);
    cb(err);
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
      } else if (net.isIP(host) === 6) {
        // IPv6 太长：先把 IPv6 字符串当域名处理（部分 SOCKS5 服务支持）
        const domainBuf = Buffer.from(host);
        req = Buffer.concat([Buffer.from([VER, CMD_CONNECT, 0, ATYP_DOMAIN, domainBuf.length]), domainBuf]);
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

// 启动服务
const server = net.createServer((client) => {
  let pendingBytes = Buffer.alloc(0);
  let target = null;

  client.once('error', (err) => {
    log('client err:', err.message);
    client.destroy();
    if (target) target.destroy();
  });

  client.on('data', (chunk) => {
    if (target) {
      target.write(chunk);
      return;
    }
    // 先缓存所有数据（CONNECT 头可能夹杂 TLS 数据）
    pendingBytes = Buffer.concat([pendingBytes, chunk]);

    // 只解析 CONNECT 第一行（到第一个 \r\n）
    if (pendingBytes.length < 7) return; // 最小 "CONNECT x:0 HTTP/1.1\r\n"
    if (pendingBytes.indexOf('\r\n') === -1) return;

    // 找 HTTP 头的结束位置（\r\n\r\n），如果还没到，就至少处理了第一行就先开始建链
    // 但更稳的做法是：等 \r\n\r\n 之后再处理（这样可以正确剔除 header）。
    // 这里折中：只解析第一行 + Host 头，然后立即开始 SOCKS5。
    // 由于 Host 头之后才是 \r\n\r\n，而 \r\n\r\n 之前剩余的 bytes 都需要发给 target。

    // 我们直接读出完整 HTTP 头（到 \r\n\r\n），因为 TLS ClientHello 极大概率不含 \r\n\r\n
    const headerEnd = pendingBytes.indexOf('\r\n\r\n');
    if (headerEnd === -1) return;

    const headerStr = pendingBytes.slice(0, headerEnd).toString('ascii');
    const lines = headerStr.split('\r\n');
    const first = lines[0];
    const m = /^CONNECT\s+([^:\s]+):(\d+)\s+HTTP/i.exec(first);
    if (!m) {
      log('not CONNECT:', first);
      client.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      client.destroy();
      return;
    }
    const host = m[1];
    const port = parseInt(m[2], 10);
    log(`CONNECT ${host}:${port}`);

    // 把 header 之后的所有数据留给 target（如果是 TLS ClientHello 等）
    const afterHeader = pendingBytes.slice(headerEnd + 4);
    pendingBytes = null;

    socks5Connect(host, port, (err, sock) => {
      if (err) {
        log('socks5 err:', err.message);
        client.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        client.destroy();
        return;
      }
      target = sock;
      // 200 表示隧道已建好
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      // 转发 CONNECT 头之后已收到的数据
      if (afterHeader.length > 0) sock.write(afterHeader);

      // 双向转发
      const onTargetErr = (e) => {
        log('target err:', e.message);
        client.destroy();
      };
      sock.on('error', onTargetErr);
      sock.on('data', (data) => {
        try { client.write(data); } catch (_) { sock.destroy(); }
      });
      sock.on('end', () => client.end());
      sock.on('close', () => client.end());

      const onClientErr = (e) => {
        log('client err:', e.message);
        sock.destroy();
      };
      client.on('error', onClientErr);
      client.on('end', () => sock.end());
      client.on('close', () => sock.destroy());
    });
  });
});

server.listen(LISTEN_PORT, '127.0.0.1', () => {
  log(`SOCKS5-HTTP bridge listening on 127.0.0.1:${LISTEN_PORT} -> socks5://${SOCKS5_HOST}:${SOCKS5_PORT}`);
});

process.on('SIGINT', () => { log('SIGINT'); server.close(); process.exit(0); });