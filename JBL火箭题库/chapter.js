/* JBL 火箭题库 · 章节页：检查项展开 / 掌握打勾 / 过滤与导航 */
(function () {
  'use strict';
  var D = window.JBL_DATA, JBL = window.JBL;

  document.getElementById('masthead').appendChild(JBL.masthead());

  /* ---- 定位章节 ---- */
  var params = new URLSearchParams(window.location.search);
  var ci = parseInt(params.get('c'), 10);
  if (!(ci >= 1 && ci <= D.chapters.length)) ci = 1;
  var ch = D.chapters[ci - 1];
  var focusQ = parseInt(params.get('q'), 10);   // 1-based 题号（搜索跳转用）

  document.title = ch.title + ' · JBL 火箭题库';
  document.getElementById('crumb-ch').textContent = 'SYS-' + String(ch.i).padStart(2, '0');
  var titleEl = document.getElementById('chap-title');
  titleEl.textContent = '';
  titleEl.appendChild(JBL.el('span', 'chap-code-chip', ch.code));
  titleEl.appendChild(document.createTextNode(ch.title));

  if (ch.intro) {
    var intro = document.getElementById('chap-intro');
    intro.innerHTML = ch.intro;
    intro.querySelector('p') && (intro.hidden = false);
  }

  /* ---- 检查项 ---- */
  var list = document.getElementById('q-list');
  var cards = [];

  ch.questions.forEach(function (q, idx) {
    var no = idx + 1;
    var card = JBL.el('article', 'q-card');
    card.id = 'q' + no;

    var head = JBL.el('div', 'q-head');
    head.setAttribute('role', 'button');
    head.tabIndex = 0;

    var tick = JBL.el('button', 'tick');
    tick.type = 'button';
    tick.title = '标记掌握 / 取消';
    tick.setAttribute('aria-label', '标记掌握');
    tick.setAttribute('aria-pressed', 'false');
    tick.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 12.5 5 5L19.5 7"/></svg>';

    var titleBtn = JBL.el('button', 'q-title', q.title);
    titleBtn.type = 'button';
    titleBtn.setAttribute('aria-expanded', 'false');

    var chev = JBL.el('span', 'chev');
    chev.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5.5 7 6.5-7 6.5"/></svg>';

    head.appendChild(tick);
    head.appendChild(JBL.el('span', 'q-no', 'Q' + String(no).padStart(2, '0')));
    head.appendChild(titleBtn);
    head.appendChild(chev);

    var body = JBL.el('div', 'q-body');
    var ans = JBL.el('div', 'ans');
    ans.innerHTML = q.html;
    body.appendChild(ans);

    card.appendChild(head);
    card.appendChild(body);
    list.appendChild(card);
    cards.push({ card: card, q: q, tick: tick, head: head, titleBtn: titleBtn });

    function setOpen(open) {
      card.classList.toggle('open', open);
      titleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    head.addEventListener('click', function (ev) {
      if (ev.target.closest('.tick')) return;
      setOpen(!card.classList.contains('open'));
    });
    head.addEventListener('keydown', function (ev) {
      if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === head) {
        ev.preventDefault();
        setOpen(!card.classList.contains('open'));
      }
    });
    // 标题按钮不再单独绑定：点击/回车激活后冒泡到 head，统一切换一次，避免双重取反互相抵消

    tick.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var done = JBL.toggle(q.id);
      applyState(cards[idx], done);
      refreshProgress();
      JBL.toast(done ? '已掌握 ' + q.title : '已取消掌握');
    });
  });

  function applyState(entry, done) {
    entry.card.classList.toggle('done', done);
    entry.tick.setAttribute('aria-pressed', done ? 'true' : 'false');
  }

  function restoreState() {
    cards.forEach(function (e) { applyState(e, JBL.isDone(e.q.id)); });
  }

  /* ---- 进度 ---- */
  function refreshProgress() {
    var done = JBL.chapterDone(ch);
    var total = ch.questions.length;
    var pct = total ? Math.round(done / total * 100) : 0;
    document.getElementById('cp-done').textContent = done;
    document.getElementById('cp-total').textContent = total;
    document.getElementById('cp-bar').style.width = pct + '%';
    document.getElementById('cp-pct').textContent = pct + '%';
    document.getElementById('chap-led').className = 'led ' + (done === 0 ? 'off' : (done === total ? 'ready' : 'busy'));
    document.getElementById('ready-banner').classList.toggle('show', done === total && total > 0);
    if (filterOn) applyFilter();   // 掌握后若开着过滤，立即隐藏
  }

  /* ---- 展开 / 收起 / 过滤 ---- */
  document.getElementById('btn-expand').addEventListener('click', function () {
    cards.forEach(function (e) { e.card.classList.add('open'); e.titleBtn.setAttribute('aria-expanded', 'true'); });
  });
  document.getElementById('btn-collapse').addEventListener('click', function () {
    cards.forEach(function (e) { e.card.classList.remove('open'); e.titleBtn.setAttribute('aria-expanded', 'false'); });
  });

  var filterOn = false;
  var btnUnonly = document.getElementById('btn-unonly');
  function applyFilter() {
    cards.forEach(function (e) {
      e.card.classList.toggle('hidden', filterOn && e.card.classList.contains('done'));
    });
  }
  btnUnonly.addEventListener('click', function () {
    filterOn = !filterOn;
    btnUnonly.setAttribute('aria-pressed', filterOn ? 'true' : 'false');
    applyFilter();
  });

  /* ---- 上一章 / 下一章 ---- */
  var nav = document.getElementById('chap-nav');
  var prev = D.chapters[ci - 2], next = D.chapters[ci];
  if (prev) {
    var b1 = JBL.el('a', 'btn');
    b1.href = 'chapter.html?c=' + prev.i;
    b1.innerHTML = '<span class="mono">PREV</span> ' + prev.title;
    nav.appendChild(b1);
  } else {
    nav.appendChild(JBL.el('span'));
  }
  if (next) {
    var b2 = JBL.el('a', 'btn');
    b2.href = 'chapter.html?c=' + next.i;
    b2.innerHTML = '<span class="mono">NEXT</span> ' + next.title;
    nav.appendChild(b2);
  } else {
    var back = JBL.el('a', 'btn primary', '返回任务控制台');
    back.href = 'index.html';
    nav.appendChild(back);
  }

  /* ---- 浮动导航 ---- */
  document.getElementById('rail-home').addEventListener('click', function () { window.location.href = 'index.html'; });
  var railTop = document.getElementById('rail-top');
  window.addEventListener('scroll', function () {
    railTop.classList.toggle('show', window.scrollY > 420);
  }, { passive: true });
  railTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

  /* ---- 启动 ---- */
  restoreState();
  refreshProgress();
  document.addEventListener('jbl:progress', function () { restoreState(); refreshProgress(); });

  if (focusQ >= 1 && focusQ <= cards.length) {
    var target = cards[focusQ - 1];
    target.card.classList.add('open', 'target');
    target.titleBtn.setAttribute('aria-expanded', 'true');
    setTimeout(function () {
      target.card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 60);
  }
})();
