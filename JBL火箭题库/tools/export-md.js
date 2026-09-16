#!/usr/bin/env node
/**
 * export-md.js — 把 tools/source.md + tools/sheets.json 合成一份干净的 Markdown
 * <sheet> 展开为 Markdown 表格，<whiteboard> 转为 assets/ 图片引用，
 * 游离的一级标题（如 "# Hystrix 配置"、"# 例如"）降为粗体小节，避免打乱章节层级。
 *
 * 用法：node tools/export-md.js   （默认读写本仓库内文件）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const srcFile = process.argv[2] || path.join(ROOT, 'tools', 'source.md');
const sheetsFile = process.argv[3] || path.join(ROOT, 'tools', 'sheets.json');
const outFile = process.argv[4] || path.join(ROOT, 'JBL火箭题库.md');

const src = fs.readFileSync(srcFile, 'utf8');
const sheets = JSON.parse(fs.readFileSync(sheetsFile, 'utf8'));

/* CSV 解析（与 build.js 同源逻辑） */
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

function mdTable(sheetId) {
  const csv = sheets[sheetId];
  if (!csv) return '> （此处原文嵌入了电子表格，快照缺失：sheet-id ' + sheetId + '）';
  const rows = csv.split('\n').filter(l => l.trim()).map(l => parseCsvLine(l.replace(/^\[row=\d+\]\s?/, '')));
  if (!rows.length) return '';
  const esc = (s) => s.replace(/\|/g, '\\|');
  const head = rows[0];
  const lines = [
    '| ' + head.map(esc).join(' | ') + ' |',
    '| ' + head.map(() => '---').join(' | ') + ' |',
  ];
  for (let i = 1; i < rows.length; i++) {
    lines.push('| ' + head.map((_, j) => esc(rows[i][j] || '')).join(' | ') + ' |');
  }
  return lines.join('\n');
}

const RE_CHAPTER = /^#\s+([一二三四五六七八九十百]+)、\s*(.+)$/;
const lines = src.split('\n').map(l => l.replace(/\r$/, ''));

/* 统计章节与题数（跳过代码块，代码块内的 # 不算标题） */
const chapters = [];
{
  let inCode = false, cur = null;
  for (const line of lines) {
    if (/^\s*```/.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;
    const cm = line.match(RE_CHAPTER);
    if (cm) { cur = { title: cm[1] + '、' + cm[2], n: 0 }; chapters.push(cur); continue; }
    if (/^##\s/.test(line) && cur) cur.n++;
  }
}
const totalQ = chapters.reduce((s, c) => s + c.n, 0);

/* 文件头 + 目录 */
const out = [];
out.push('# JBL常见面试题-火箭-持续更新');
out.push('');
out.push('> 导出自飞书文档 [《JBL常见面试题-火箭-持续更新》](https://j1wtmv7ajj.feishu.cn/wiki/DCGfwqQ1cinVrOkWVBQcIQisnrd) · 导出日期 ' +
  new Date().toISOString().slice(0, 10) + ' · ' + chapters.length + ' 章 ' + totalQ + ' 题');
out.push('> 原文嵌入的飞书电子表格已展开为 Markdown 表格；画板以图片引用（见 assets/ 目录）。');
out.push('');
out.push('## 目录');
out.push('');
chapters.forEach((c, i) => out.push((i + 1) + '. ' + c.title + '（' + c.n + ' 题）'));
out.push('');
out.push('---');
out.push('');

/* 正文转换 */
let inCode = false;
for (const line of lines) {
  if (/^\s*```/.test(line)) { inCode = !inCode; out.push(line); continue; }
  if (inCode) { out.push(line); continue; }
  const t = line.trim();
  if (/^<title>/.test(t)) continue;                                    // 原始标题标记，丢弃
  const sm = t.match(/^<sheet\s+sheet-id="([^"]+)"/);
  if (sm) { out.push(mdTable(sm[1])); continue; }                      // 嵌入表格 → MD 表格
  const wm = t.match(/^<whiteboard\s+token="([^"]+)"/);
  if (wm) { out.push('![画板导出图](assets/wb-' + wm[1] + '.jpg)'); continue; }
  if (/^#\s/.test(line) && !RE_CHAPTER.test(line)) {                   // 游离 H1 → 粗体小节
    out.push('**' + line.replace(/^#\s+/, '').trim() + '**');
    continue;
  }
  out.push(line);
}

fs.writeFileSync(outFile, out.join('\n'), 'utf8');
console.log('已导出:', outFile);
console.log('章节数:', chapters.length, ' 题目总数:', totalQ);
