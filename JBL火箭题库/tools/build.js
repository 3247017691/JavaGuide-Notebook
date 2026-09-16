#!/usr/bin/env node
/**
 * build.js — 把飞书文档《JBL常见面试题-火箭-持续更新》的导出内容编译成 ../data.js
 *
 * 更新流程（原文「持续更新」后重新导出）：
 *   1. 拉正文（二选一）：
 *      a) lark-cli docs +fetch --doc "https://j1wtmv7ajj.feishu.cn/wiki/DCGfwqQ1cinVrOkWVBQcIQisnrd" \
 *           --doc-format markdown --as user > tools/source.json
 *      b) 手工把 JSON 里 data.document.content 存成 tools/source.md
 *   2. 若文档新增/修改了嵌入电子表格：
 *      lark-cli sheets +csv-get --spreadsheet-token <token> --sheet-id <id> --as user
 *      把 annotated_csv 补进 tools/sheets.json
 *   3. node build.js [输入文件]     # 默认 ./source.md，兼容 lark-cli 原始 JSON
 */
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const inputFile = process.argv[2] || path.join(HERE, 'source.md');
const sheetsFile = path.join(HERE, 'sheets.json');
const outFile = process.env.JBL_OUT || path.join(HERE, '..', 'data.js');
const assetsDir = path.join(path.dirname(outFile), 'assets');

/* ---------- 输入 ---------- */
let src = fs.readFileSync(inputFile, 'utf8');
try {
  const j = JSON.parse(src);
  if (j && j.data && j.data.document && j.data.document.content) src = j.data.document.content;
} catch (e) { /* 纯 markdown 输入 */ }
const sheets = JSON.parse(fs.readFileSync(sheetsFile, 'utf8'));

/* ---------- 工具 ---------- */
const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function inline(s) {
  const codes = [];
  s = String(s).replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return '\u0001' + (codes.length - 1) + '\u0001'; });
  s = escapeHtml(s);
  s = s.replace(/\\([\\`*_{}[\]()#+.!~-])/g, '$1');          // markdown 转义还原
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/\u0001(\d+)\u0001/g, (m, i) => '<code>' + codes[+i] + '</code>');
  return s;
}

function parseCsvLine(line) {
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function sheetTable(sheetId) {
  const csv = sheets[sheetId];
  if (!csv) return '<div class="embed-missing">此处原文嵌入了电子表格，但快照中未找到（sheet-id: ' + escapeHtml(sheetId) + '）</div>';
  const rows = csv.split('\n').filter(l => l.trim()).map(l => parseCsvLine(l.replace(/^\[row=\d+\]\s?/, '')));
  if (!rows.length) return '';
  const [head, ...body] = rows;
  let h = '<div class="sheet-wrap"><table class="sheet-table"><thead><tr>';
  head.forEach(c => h += '<th>' + inline(c) + '</th>');
  h += '</tr></thead><tbody>';
  body.forEach(r => {
    h += '<tr>';
    for (let i = 0; i < head.length; i++) h += '<td>' + inline(r[i] || '') + '</td>';
    h += '</tr>';
  });
  h += '</tbody></table></div>';
  return h;
}

const listLevel = (indent) => indent < 1 ? 0 : indent < 4 ? 1 : indent < 8 ? 2 : 3;

function renderList(lines, li, re) {
  // lines[i..] 为连续列表行（含嵌套缩进），返回 [html, 下一行下标]
  const stack = [];       // { type, level }
  const out = [];
  const closeTo = (level, type) => {
    while (stack.length && stack[stack.length - 1].level > level) { out.push('</li></' + stack.pop().type + '>'); }
    if (stack.length && stack[stack.length - 1].level === level) {
      if (stack[stack.length - 1].type !== type) { out.push('</' + stack.pop().type + '></li>'); return false; }
      out.push('</li>'); return true;                    // 同级同类型：仅闭合 li
    }
    return false;                                        // 需要新开列表
  };
  let i = li;
  while (i < lines.length) {
    if (!lines[i].trim()) {                             // 空行：后面还是列表项则视为松散列表续行
      let k = i + 1;
      while (k < lines.length && !lines[k].trim()) k++;
      if (k < lines.length && re.test(lines[k])) { i = k; continue; }
      break;
    }
    const m = lines[i].match(re);
    if (!m) break;
    const level = listLevel(m[1].length);
    const type = /^\d/.test(m[2]) ? 'ol' : 'ul';
    const opened = closeTo(level, type);
    if (!opened) {
      if (stack.length) out.push('<' + type + '>');      // 嵌套：在上一 li 内开新表
      else out.push('<' + type + '>');
      stack.push({ type, level });
    }
    out.push('<li>' + inline(m[3]));
    i++;
  }
  while (stack.length) out.push('</li></' + stack.pop().type + '>');
  return [out.join(''), i];
}

const RE_LIST = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;
const RE_CHAPTER = /^#\s+([一二三四五六七八九十百]+)、\s*(.+)$/;
const RE_H2 = /^##\s+(.*)$/;

function renderMd(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {                          // 代码块
      const lang = line.trim().slice(3).trim();
      const body = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { body.push(lines[i]); i++; }
      i++;
      out.push('<pre class="code" data-lang="' + escapeHtml(lang) + '"><code>' + escapeHtml(body.join('\n')) + '</code></pre>');
    } else if (/^---+\s*$/.test(line)) {                 // 分隔线
      out.push('<hr class="md-hr">'); i++;
    } else if (RE_LIST.test(line)) {                     // 列表（含嵌套）
      const [html, next] = renderList(lines, i, RE_LIST);
      out.push(html); i = next;
    } else if (/^>/.test(line)) {                        // 引用块
      const qs = [];
      while (i < lines.length && /^>/.test(lines[i])) { qs.push(lines[i].replace(/^>\s?/, '')); i++; }
      const paras = qs.join('\n').split(/\n\s*\n/).filter(p => p.trim());
      out.push('<blockquote class="md-quote">' + paras.map(p => '<p>' + inline(p.split('\n').join('')) + '</p>').join('') + '</blockquote>');
    } else if (/^<sheet\s/.test(line.trim())) {          // 嵌入表格
      const m = line.match(/sheet-id="([^"]+)"/);
      out.push(m ? sheetTable(m[1]) : '');
      i++;
    } else if (/^<whiteboard\s/.test(line.trim())) {     // 画板 → 预导出的图片
      const m = line.match(/token="([^"]+)"/);
      const img = m && fs.existsSync(path.join(assetsDir, 'wb-' + m[1] + '.jpg'));
      out.push(img
        ? '<figure class="wb-fig"><img src="assets/wb-' + m[1] + '.jpg" alt="画板导出图" loading="lazy"></figure>'
        : '<div class="embed-missing">此处原文为画板，快照未包含；可用 lark-cli docs +media-download --type whiteboard 导出后放入 assets/ 再重新构建</div>');
      i++;
    } else if (/^<(img|bitable|vc-transcribe-tab|synced_reference)\b/.test(line.trim())) {
      out.push('<div class="embed-missing">此处原文嵌入了附件，导出快照未包含，详见飞书原文</div>');
      i++;
    } else if (/^###\s+/.test(line)) { out.push('<h4 class="sub-head">' + inline(line.replace(/^###\s+/, '')) + '</h4>'); i++; }
    else if (/^####\s+/.test(line)) { out.push('<h5 class="sub-head">' + inline(line.replace(/^####\s+/, '')) + '</h5>'); i++; }
    else if (/^#\s+/.test(line)) { out.push('<h4 class="sub-head">' + inline(line.replace(/^#\s+/, '')) + '</h4>'); i++; }
    else if (/^<title>/.test(line.trim())) { i++; }      // 文档标题标记，丢弃
    else if (!line.trim()) { i++; }
    else {                                               // 段落
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^\s*```/.test(lines[i]) && !RE_LIST.test(lines[i])
             && !/^>/.test(lines[i]) && !/^<(sheet|whiteboard)\s/.test(lines[i].trim()) && !/^#{1,4}\s/.test(lines[i])
             && !/^---+\s*$/.test(lines[i]) && !/^<(img|bitable|vc-transcribe-tab|synced_reference|title)\b/.test(lines[i].trim())) {
        para.push(lines[i]); i++;
      }
      out.push('<p>' + inline(para.join('')) + '</p>');
    }
  }
  return out.join('\n');
}

/* ---------- 拆章节 / 题目 ---------- */
const CODES = ['BAS', 'DB', 'WEB', 'SPRG', 'RDS', 'MQ', 'CLD', 'ES', 'LNX', 'FE', 'PRJ', 'AI', 'SCN', 'HR'];
const lines = src.split('\n').map(l => l.replace(/\r$/, ''));
const chapters = [];
let curCh = null, curQ = null, inCode = false;

for (const line of lines) {
  if (/^\s*```/.test(line)) {                            // 代码块内的 # 不当标题
    if (curQ) curQ.raw.push(line);
    inCode = !inCode;
    continue;
  }
  if (!inCode) {
    const cm = line.match(RE_CHAPTER);
    if (cm) {
      curCh = { title: cm[2], questions: [], intro: [] };
      chapters.push(curCh); curQ = null;
      continue;
    }
    if (RE_H2.test(line)) {
      if (!curCh) continue;                              // 章节前的零散内容，丢弃
      curQ = { title: line.replace(RE_H2, '$1').trim(), raw: [] };
      curCh.questions.push(curQ);
      continue;
    }
  }
  if (curQ) curQ.raw.push(line);
  else if (curCh && line.trim()) curCh.intro.push(line);
}

/* ---------- 渲染 ---------- */
const stripTags = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
let total = 0;
const data = {
  meta: {
    title: 'JBL常见面试题-火箭-持续更新',
    source: 'https://j1wtmv7ajj.feishu.cn/wiki/DCGfwqQ1cinVrOkWVBQcIQisnrd',
    exportedAt: '2026-09-15',
    sheets: Object.keys(sheets).length,
  },
  chapters: chapters.map((ch, ci) => ({
    i: ci + 1,
    code: CODES[ci] || ('S' + (ci + 1)),
    title: ch.title,
    intro: ch.intro.length ? renderMd(ch.intro) : '',
    questions: ch.questions.map((q, qi) => {
      total++;
      const html = renderMd(q.raw);
      return {
        id: 'q-' + (ci + 1) + '-' + (qi + 1),
        title: q.title,
        html: html || '<p class="empty-ans">（原文此题未展开，详见飞书文档）</p>',
        plain: (q.title + ' ' + stripTags(html)).slice(0, 400),
      };
    }),
  })),
};
data.meta.total = total;

fs.writeFileSync(outFile,
  '// 由 tools/build.js 生成，勿手改；更新流程见 build.js 头部注释\n' +
  'window.JBL_DATA = ' + JSON.stringify(data) + ';\n', 'utf8');

/* ---------- 报告 ---------- */
console.log('章节数:', data.chapters.length, ' 题目总数:', total);
data.chapters.forEach(c => console.log(
  '  SYS-' + String(c.i).padStart(2, '0') + ' [' + c.code + '] ' + c.title + ' — ' + c.questions.length + ' 题'));
const missing = JSON.stringify(data).includes('embed-missing');
console.log('嵌入表格:', data.meta.sheets, '张', missing ? '（存在缺失占位，检查 sheets.json）' : '');
