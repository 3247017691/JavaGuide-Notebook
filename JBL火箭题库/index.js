/* JBL 火箭题库 · 首页：准备度面板 / 搜索 / 系统卡阵 */
(function () {
  'use strict';
  var D = window.JBL_DATA, JBL = window.JBL;

  /* ---- 顶栏 ---- */
  document.getElementById('masthead').appendChild(JBL.masthead());

  /* ---- 准备度面板 ---- */
  var SEGS = 24;
  var segbar = document.getElementById('segbar');
  for (var i = 0; i < SEGS; i++) segbar.appendChild(document.createElement('i'));

  function refreshHero() {
    var total = D.meta.total;
    var done = JBL.totalDone();
    var pct = total ? Math.round(done / total * 100) : 0;
    var readyChapters = 0;
    D.chapters.forEach(function (c) { if (c.questions.length && JBL.chapterDone(c) === c.questions.length) readyChapters++; });

    document.getElementById('r-pct').textContent = pct;
    document.getElementById('st-done').textContent = done;
    document.getElementById('st-total').textContent = total;
    document.getElementById('st-left').textContent = total - done;
    document.getElementById('st-ready').firstChild.nodeValue = readyChapters;
    document.getElementById('st-chapters').textContent = D.chapters.length;

    var lit = Math.round(pct / 100 * SEGS);
    Array.prototype.forEach.call(segbar.children, function (seg, idx) {
      seg.className = idx < lit ? 'on' : '';
    });

    var line = document.getElementById('mission-line');
    var hero = document.getElementById('hero');
    var rd = document.getElementById('readiness');
    if (done === 0) {
      line.innerHTML = '系统待命 · T-' + total + ' · 从任一系统开始检查';
    } else if (done < total) {
      line.innerHTML = '倒计时进行中 · <b>T-' + (total - done) + '</b> · 剩余 ' + (total - done) + ' 项检查';
    } else {
      line.innerHTML = '全部检查完成 · 祝面试顺利';
    }
    hero.classList.toggle('is-liftoff', done === total && total > 0);
    rd.classList.toggle('all-done', done === total && total > 0);
  }

  /* ---- 系统卡阵 ---- */
  var deck = document.getElementById('deck');
  function buildDeck() {
    deck.textContent = '';
    D.chapters.forEach(function (c, idx) {
      var a = document.createElement('a');
      a.className = 'card';
      a.href = 'chapter.html?c=' + c.i;

      var top = JBL.el('div', 'card-top');
      var led = JBL.el('span', 'led off');
      led.id = 'led-' + c.i;
      top.appendChild(led);
      top.appendChild(JBL.el('span', 'card-code', 'SYS-' + String(c.i).padStart(2, '0') + ' · ' + c.code));
      a.appendChild(top);

      a.appendChild(JBL.el('h2', 'card-title', c.title));

      var sub = JBL.el('div', 'card-sub');
      sub.id = 'sub-' + c.i;
      a.appendChild(sub);

      var bar = JBL.el('div', 'bar');
      var fill = document.createElement('i');
      fill.id = 'bar-' + c.i;
      bar.appendChild(fill);
      a.appendChild(bar);

      var pctEl = JBL.el('div', 'pct', '0%');
      pctEl.id = 'pct-' + c.i;
      a.appendChild(pctEl);

      var stamp = JBL.el('span', 'stamp', 'READY');
      stamp.id = 'stamp-' + c.i;
      stamp.style.display = 'none';
      a.appendChild(stamp);

      deck.appendChild(a);
    });
  }

  function refreshDeck() {
    D.chapters.forEach(function (c) {
      var done = JBL.chapterDone(c);
      var total = c.questions.length;
      var pct = total ? Math.round(done / total * 100) : 0;

      var led = document.getElementById('led-' + c.i);
      led.className = 'led ' + (done === 0 ? 'off' : (done === total ? 'ready' : 'busy'));

      var sub = document.getElementById('sub-' + c.i);
      sub.textContent = '';
      sub.appendChild(document.createTextNode(c.questions.length + ' 项检查 · 已掌握 '));
      var b = JBL.el('b', done === 0 ? 'zero' : '', String(done));
      sub.appendChild(b);

      document.getElementById('bar-' + c.i).style.width = pct + '%';
      document.getElementById('pct-' + c.i).textContent = pct + '%';

      var card = document.querySelector('a[href="chapter.html?c=' + c.i + '"]');
      if (card) card.classList.toggle('is-ready', done === total && total > 0);
      document.getElementById('stamp-' + c.i).style.display = (done === total && total > 0) ? '' : 'none';
    });
  }

  /* ---- 搜索 ---- */
  var INDEX = [];
  D.chapters.forEach(function (c) {
    c.questions.forEach(function (q, qi) {
      INDEX.push({ c: c, q: q, qi: qi + 1, lower: (q.title + ' ' + q.plain).toLowerCase() });
    });
  });

  var input = document.getElementById('search-input');
  var box = document.getElementById('search-results');
  var activeIdx = -1;
  var currentResults = [];

  function escReg(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function highlight(text, kw) {
    var re = new RegExp(escReg(kw), 'gi');
    return text.replace(re, function (m) { return '<mark>' + m + '</mark>'; });
  }

  function closeResults() {
    box.classList.remove('open');
    activeIdx = -1;
  }

  function render() {
    var kw = input.value.trim().toLowerCase();
    if (!kw) { closeResults(); return; }
    currentResults = [];
    var seen = {};
    INDEX.forEach(function (item) {
      if (currentResults.length >= 30) return;
      var pos = item.lower.indexOf(kw);
      if (pos !== -1 && !seen[item.q.id]) {
        seen[item.q.id] = 1;
        currentResults.push({ item: item, pos: pos });
      }
    });

    box.textContent = '';
    if (!currentResults.length) {
      var empty = JBL.el('div', 'sr-empty', '没有匹配的检查项');
      box.appendChild(empty);
    } else {
      currentResults.forEach(function (r, idx) {
        var it = r.item;
        var div = document.createElement('div');
        div.className = 'sr-item';
        div.setAttribute('role', 'option');
        div.dataset.idx = idx;

        var chip = JBL.el('div', 'sr-chapter', 'SYS-' + String(it.c.i).padStart(2, '0') + ' · ' + it.c.title);
        div.appendChild(chip);

        var title = document.createElement('div');
        title.className = 'sr-title';
        title.innerHTML = highlight(it.q.title, kw);
        div.appendChild(title);

        if (r.pos > 0 && it.q.plain) {
          var around = it.q.plain.slice(Math.max(0, r.pos - 24), r.pos + 60);
          var snip = JBL.el('div', 'sr-snip');
          snip.innerHTML = '…' + highlight(around, kw) + '…';
          div.appendChild(snip);
        }
        div.addEventListener('mousedown', function (ev) { ev.preventDefault(); go(idx); });
        box.appendChild(div);
      });
    }
    box.classList.add('open');
    activeIdx = -1;
  }

  function go(idx) {
    var r = currentResults[idx];
    if (!r) return;
    window.location.href = 'chapter.html?c=' + r.item.c.i + '&q=' + r.item.qi;
  }

  input.addEventListener('input', render);
  input.addEventListener('keydown', function (ev) {
    if (!box.classList.contains('open')) return;
    var items = box.querySelectorAll('.sr-item');
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      activeIdx = ev.key === 'ArrowDown'
        ? (activeIdx + 1) % items.length
        : (activeIdx - 1 + items.length) % items.length;
      items.forEach(function (n, i) { n.classList.toggle('active', i === activeIdx); });
      if (items[activeIdx]) items[activeIdx].scrollIntoView({ block: 'nearest' });
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      go(activeIdx >= 0 ? activeIdx : 0);
    } else if (ev.key === 'Escape') {
      closeResults();
    }
  });
  document.addEventListener('click', function (ev) {
    if (!document.getElementById('search').contains(ev.target)) closeResults();
  });

  /* “/” 快捷聚焦 */
  document.addEventListener('keydown', function (ev) {
    if (ev.key === '/' && document.activeElement !== input && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
      ev.preventDefault();
      input.focus();
    }
  });

  /* ---- 重置 ---- */
  document.getElementById('reset-btn').addEventListener('click', function () {
    if (window.confirm('确定清空全部掌握记录吗？此操作不可撤销。')) {
      JBL.reset();
      refreshHero();
      refreshDeck();
      JBL.toast('进度已重置，重新开始检查');
    }
  });

  /* ---- 回到顶部 ---- */
  var railTop = document.getElementById('rail-top');
  window.addEventListener('scroll', function () {
    railTop.classList.toggle('show', window.scrollY > 420);
  }, { passive: true });
  railTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

  /* ---- 启动 ---- */
  document.getElementById('export-date').textContent = '导出于 ' + D.meta.exportedAt;
  buildDeck();
  refreshHero();
  refreshDeck();
  /* 进度库拉取完成后按服务端事实重绘（file:// 下该事件同样会触发，内容即本地镜像） */
  document.addEventListener('jbl:progress', function () { refreshHero(); refreshDeck(); });
})();
