/* 无损压缩：JSON / 文本 / SVG 在 ≥1KB 时 gzip。不可压缩类型直通，Range 请求放行。 */
const zlib = require("zlib");

const COMPRESSIBLE = /^(application\/json|application\/javascript|text\/|image\/svg\+xml|application\/xml)/i;
const MIN = 1024;

function gzipShim() {
  return function (req, res, next) {
    if (!/\bgzip\b/i.test(String(req.headers["accept-encoding"] || ""))) return next();
    if (req.headers.range) return next();

    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);
    let mode = null; // null=未决定  "buffer"=缓冲待压  "pass"=直通
    let chunks = [];
    let total = 0;

    const decide = () => {
      if (mode) return;
      const ct = String(res.getHeader("Content-Type") || "");
      mode = (res.statusCode === 200 && COMPRESSIBLE.test(ct)) ? "buffer" : "pass";
    };

    res.write = function (chunk, enc, cb) {
      decide();
      if (mode === "pass") return origWrite(chunk, enc, cb);
      if (typeof chunk === "string") chunk = Buffer.from(chunk, enc || "utf8");
      if (chunk && chunk.length) { chunks.push(chunk); total += chunk.length; }
      if (typeof enc === "function") enc();
      else if (typeof cb === "function") cb();
      return true;
    };

    res.end = function (chunk, enc, cb) {
      if (typeof chunk === "function") { cb = chunk; chunk = null; }
      if (typeof enc === "function") { cb = enc; enc = undefined; }
      decide();
      if (chunk) {
        if (typeof chunk === "string") chunk = Buffer.from(chunk, enc || "utf8");
        if (mode === "pass") return origEnd(chunk, cb);
        if (chunk.length) { chunks.push(chunk); total += chunk.length; }
      }
      if (mode === "pass") return origEnd(cb);

      const body = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, total);
      chunks = [];
      if (total < MIN || res.getHeader("Content-Encoding")) {
        res.setHeader("Content-Length", body.length);
        return origEnd(body, cb);
      }
      const gz = zlib.gzipSync(body, { level: 6 });
      if (gz.length >= body.length) {
        res.setHeader("Content-Length", body.length);
        return origEnd(body, cb);
      }
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Vary", "Accept-Encoding");
      res.setHeader("Content-Length", gz.length);
      return origEnd(gz, cb);
    };
    next();
  };
}

module.exports = { gzipShim };
