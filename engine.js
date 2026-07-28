/**
 * 두 검사(성격 / 연애)가 공유하는 문항 진행·채점 엔진.
 * 화면 구조(id)는 동일하고, 문항·유형·카피만 config로 주입한다.
 */
window.QuizEngine = (function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const setText = (id, value) => { const n = $(id); if (n) n.textContent = value; };
  const setHTML = (id, value) => { const n = $(id); if (n) n.innerHTML = value; };

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ESCAPES[c]);

  const NAME_MAX = 20;
  /** 서버가 없을 때(또는 저장 실패했을 때) 이 기기에 쌓아두는 기록 */
  const LOCAL_RECORDS_KEY = 'oneul-test/records/v1';
  const LOCAL_RECORDS_MAX = 200;

  /* ── 기기 안에서 쓰는 유틸 ─────────────────────── */

  function randomId() {
    try {
      const bytes = new Uint8Array(9);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    } catch (_) {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }
  }

  /** "2026년 7월 28일 오후 3:04" */
  function formatDate(date) {
    try {
      return new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      }).format(date);
    } catch (_) {
      return date.toISOString().slice(0, 16).replace('T', ' ');
    }
  }

  /** 클립보드. HTTPS가 아니거나 구형 사파리면 textarea 로 물러선다 */
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) { /* 아래 폴백으로 */ }

    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (_) {
      return false;
    }
  }

  function currentPageUrl() {
    try {
      const url = new URL(window.location.href);
      url.search = '';
      url.hash = '';
      return url.href;
    } catch (_) {
      return window.location.href;
    }
  }

  /**
   * 지원 기기에서는 운영체제 공유 시트를 열고, 미지원 브라우저에서는
   * 결과와 주소를 클립보드에 복사한다.
   */
  async function shareResult(title, text) {
    const url = currentPageUrl();
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return 'shared';
      } catch (error) {
        if (error && error.name === 'AbortError') return 'cancelled';
        /* 권한·브라우저 오류면 아래 복사 폴백으로 이어간다. */
      }
    }
    return await copyText(`${text}\n\n${url}`) ? 'copied' : 'failed';
  }

  function mount(config) {
    const { storageKey, questions, types, axes, testId, testLabel } = config;

    const el = {
      screens:   document.querySelectorAll('.screen'),
      intro:     $('screen-intro'),
      quiz:      $('screen-quiz'),
      result:    $('screen-result'),
      name:      $('tester-name'),
      nameError: $('tester-name-error'),
      start:     $('btn-start'),
      resume:    $('btn-resume'),
      back:      $('btn-back'),
      exit:      $('btn-exit'),
      share:     $('btn-share'),
      copyAll:   $('btn-copy-answers'),
      restart:   $('btn-restart'),
      progress:  $('progress-fill'),
      quizBody:  document.querySelector('.quiz'),
      snackbar:  $('snackbar'),
    };
    const optionEls = $('q-options').querySelectorAll('.option');

    /** answers[i] = 해당 문항에서 고른 극 문자 */
    let answers = new Array(questions.length).fill(null);
    let cursor = 0;
    let locked = false;      // 자동 전환 중 중복 입력 차단
    let testerName = '';
    let sessionId = '';      // 한 번의 검사를 가리키는 값. 서버에서 이 값으로 덮어쓴다
    let finishedAt = null;
    let lastScore = null;    // 결과 화면이 그린 마지막 채점 결과

    /* ── 저장 ────────────────────────────────────── */
    function save() {
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          answers, cursor, name: testerName, sessionId,
        }));
      } catch (_) { /* 시크릿 모드 등 — 저장이 안 돼도 검사는 동작한다 */ }
    }
    function load() {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!Array.isArray(data.answers) || data.answers.length !== questions.length) return null;
        return data;
      } catch (_) { return null; }
    }
    function clear() {
      try { localStorage.removeItem(storageKey); } catch (_) {}
    }

    /* ── 화면 ────────────────────────────────────── */
    function show(screen) {
      el.screens.forEach((s) => s.classList.toggle('is-active', s === screen));
      window.scrollTo(0, 0);
    }

    let snackTimer;
    function snack(message) {
      el.snackbar.textContent = message;
      el.snackbar.classList.add('is-open');
      clearTimeout(snackTimer);
      snackTimer = setTimeout(() => el.snackbar.classList.remove('is-open'), 3000);
    }

    /* ── 이름 ────────────────────────────────────── */
    function readName() {
      return (el.name.value || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
    }
    function flagName(message) {
      el.name.classList.add('is-invalid');
      el.name.setAttribute('aria-invalid', 'true');
      el.nameError.textContent = message;
      el.name.focus();
    }
    function unflagName() {
      el.name.classList.remove('is-invalid');
      el.name.removeAttribute('aria-invalid');
      el.nameError.textContent = '';
    }

    /* ── 문항 ────────────────────────────────────── */
    function renderQuestion() {
      const q = questions[cursor];
      setText('q-scene', q.scene);
      setText('q-text', q.q);
      setText('q-index', String(cursor + 1));
      setText('q-total', String(questions.length));

      optionEls.forEach((node) => {
        const opt = node.dataset.side === 'A' ? q.a : q.b;
        node.querySelector('.option__label').textContent = opt.t;
        node.classList.toggle('is-picked', answers[cursor] === opt.p);
      });

      const done = answers.filter(Boolean).length;
      el.progress.style.width = (done / questions.length) * 100 + '%';
      const bar = document.querySelector('.progress');
      bar.setAttribute('aria-valuemax', String(questions.length));
      bar.setAttribute('aria-valuenow', String(done));

      el.back.disabled = cursor === 0;
    }

    function goTo(index) {
      locked = true;
      el.quizBody.classList.add('is-swapping');
      setTimeout(() => {
        cursor = index;
        renderQuestion();
        el.quizBody.classList.remove('is-swapping');
        locked = false;
      }, 150);
    }

    function answer(side) {
      if (locked) return;
      const q = questions[cursor];
      answers[cursor] = (side === 'A' ? q.a : q.b).p;
      optionEls.forEach((node) => node.classList.toggle('is-picked', node.dataset.side === side));
      save();

      setTimeout(() => {
        if (cursor === questions.length - 1) {
          const missing = answers.findIndex((a) => a === null);
          if (missing !== -1) {
            goTo(missing);
            snack('아직 답하지 않은 질문이 있어요');
            return;
          }
          showResult();
        } else {
          goTo(cursor + 1);
        }
      }, 200);
    }

    /* ── 채점 ────────────────────────────────────── */
    function score() {
      const tally = {};
      const total = {};
      axes.forEach((a) => { tally[a.left] = 0; tally[a.right] = 0; total[a.key] = 0; });

      questions.forEach((q, i) => {
        if (!answers[i]) return;
        tally[answers[i]] += 1;
        total[q.axis] += 1;
      });

      // 각 축의 문항 수가 홀수라 동점은 나오지 않지만, 방어적으로 좌측 극을 택한다
      const code = axes.map((a) => (tally[a.left] >= tally[a.right] ? a.left : a.right)).join('');

      const bars = axes.map((axis) => {
        const n = total[axis.key] || 1;
        const leftPct = Math.round((tally[axis.left] / n) * 100);
        return { axis, leftPct, rightPct: 100 - leftPct };
      });

      return { code, bars };
    }

    /* ── 결과 ────────────────────────────────────── */

    /** 결과 카드의 제목을 그대로 가져다 쓴다. 검사마다 문구가 달라서 복제하지 않는다 */
    function titleOf(id) {
      const card = $(id) && $(id).closest('.card');
      const heading = card && card.querySelector('.card__title');
      return heading ? heading.textContent.trim() : '';
    }

    /** 네 축에서 모두 반대 극을 고른 결과 코드를 만든다. */
    function oppositeCode(code) {
      const opposite = {};
      axes.forEach((axis) => {
        opposite[axis.left] = axis.right;
        opposite[axis.right] = axis.left;
      });
      return code.split('').map((letter) => opposite[letter] || letter).join('');
    }

    /** 결과 화면의 "내가 고른 답" 목록 */
    function renderReview() {
      setText('r-review-count', String(questions.length));
      setHTML('r-answers', questions.map((q, i) => {
        const picked = answers[i];
        const mine = q.a.p === picked ? q.a : q.b;
        const other = q.a.p === picked ? q.b : q.a;
        return `
          <li class="review__item">
            <p class="review__scene"><span class="review__no">${i + 1}</span>${esc(q.scene)}</p>
            <p class="review__q">${esc(q.q)}</p>
            <p class="review__pick">
              <span class="review__pole">${esc(mine.p)}</span>
              <span>${esc(mine.t)}</span>
            </p>
            <p class="review__skip">${esc(other.t)}</p>
          </li>`;
      }).join(''));
    }

    /** 답변만 텍스트로 */
    function answersText() {
      return questions.map((q, i) => {
        const picked = answers[i];
        const mine = q.a.p === picked ? q.a : q.b;
        return `${i + 1}. ${q.scene}\n   ${q.q}\n   → ${mine.t} (${mine.p})`;
      }).join('\n\n');
    }

    /** 공유용 짧은 문구 */
    function shortText() {
      const base = config.shareText(lastScore.code, types[lastScore.code]);
      return testerName ? `${testerName}님의 결과\n${base}` : base;
    }

    /** 저장·전달용 전체 리포트 */
    function fullText() {
      const { code, bars } = lastScore;
      const t = types[code];
      const out = [];

      out.push(`${testLabel} 결과`);
      out.push('='.repeat(28));
      out.push(`이름: ${testerName}`);
      out.push(`유형: ${code} · ${t.nick}`);
      out.push(`한 줄: ${t.tagline}`);
      if (t.attachment) out.push(`애착 유형: ${t.attachment}`);
      out.push(`검사일: ${formatDate(finishedAt || new Date())}`);

      out.push('', `[${titleOf('r-bars')}]`);
      bars.forEach(({ axis, leftPct, rightPct }) => {
        out.push(`${axis.left} ${axis.leftName} ${leftPct}%  |  ${rightPct}% ${axis.rightName} ${axis.right}`);
      });

      out.push('', `[${titleOf('r-desc')}]`, t.desc);
      out.push('', `[${titleOf('r-traits')}]`, ...t.traits.map((x) => `· ${x}`));
      out.push('', `[${titleOf('r-watch')}]`, t.watch);
      out.push('', `[${titleOf('r-pair')}]`,
        ...t.pair.map(([c, why]) => `· ${c} ${types[c].nick} — ${why}`));

      const worstCode = oppositeCode(code);
      const worstType = types[worstCode];
      if (worstType) {
        const why = config.worstText
          ? config.worstText(worstCode, worstType, t)
          : '네 가지 성향 축이 모두 반대라 서로의 기준을 자주 확인해야 해요.';
        out.push('', `[${titleOf('r-worst')}]`, `· ${worstCode} ${worstType.nick} — ${why}`);
      }

      out.push('', `[${titleOf('r-answers')}]`, answersText());
      out.push('', '재미로 보는 참고 자료예요. 심리 진단이 아니에요.');

      return out.join('\n');
    }

    /* ── 기록 남기기 ─────────────────────────────── */

    function localRecords() {
      try {
        const parsed = JSON.parse(localStorage.getItem(LOCAL_RECORDS_KEY));
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) { return []; }
    }

    function saveLocalRecord(record) {
      try {
        const rows = localRecords().filter((r) => r.sessionId !== record.sessionId);
        rows.unshift(record);
        localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(rows.slice(0, LOCAL_RECORDS_MAX)));
      } catch (_) { /* 저장 공간이 없어도 검사 자체는 끝났다 */ }
    }

    /**
     * 결과를 서버에 올린다. 실패해도 사용자에겐 알리지 않는다 —
     * 기록은 관리자용이고, 검사한 사람이 할 수 있는 일이 없다.
     */
    function recordResult() {
      const record = {
        sessionId,
        test: testId,
        testLabel,
        name: testerName,
        code: lastScore.code,
        nick: types[lastScore.code].nick,
        answers: answers.slice(),
        total: questions.length,
        createdAt: (finishedAt || new Date()).toISOString(),
      };

      saveLocalRecord(record);

      fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
        keepalive: true,
      }).catch(() => { /* 오프라인이거나 저장소 미설정 — 로컬 기록만 남는다 */ });
    }

    function showResult() {
      lastScore = score();
      finishedAt = new Date();

      const { code, bars } = lastScore;
      const t = types[code];

      setText('r-who', testerName ? `${testerName}님,` : '');
      setText('r-code', code);
      setText('r-nick', t.nick);
      setText('r-tagline', t.tagline);
      setText('r-desc', t.desc);
      setText('r-watch', t.watch);
      setText('r-attachment', t.attachment || '');

      setHTML('r-bars', bars.map(({ axis, leftPct, rightPct }) => {
        const leftWins = leftPct >= rightPct;
        return `
          <div class="bar">
            <div class="bar__head">
              <span class="bar__side ${leftWins ? 'is-win' : ''}">
                ${axis.left} · ${axis.leftName}<small>${axis.leftDesc}</small>
              </span>
              <span class="bar__side ${leftWins ? '' : 'is-win'}" style="text-align:right">
                ${axis.rightName} · ${axis.right}<small>${axis.rightDesc}</small>
              </span>
            </div>
            <div class="bar__track">
              <div class="bar__fill${leftWins ? '' : ' bar__fill--right'}"
                   style="width:${leftWins ? leftPct : rightPct}%"></div>
            </div>
            <div class="bar__pct">
              <span>${leftPct}%</span>
              ${leftPct === rightPct ? '<span class="bar__tie">거의 반반이에요</span>' : ''}
              <span>${rightPct}%</span>
            </div>
          </div>`;
      }).join(''));

      setHTML('r-traits', t.traits.map((x) => `<li>${x}</li>`).join(''));

      setHTML('r-pair', t.pair.map(([c, why]) => `
        <div class="pair__item">
          <span class="pair__code">${c}</span>
          <span class="pair__why">${types[c].nick} — ${why}</span>
        </div>`).join(''));

      const worstCode = oppositeCode(code);
      const worstType = types[worstCode];
      if (worstType) {
        const why = config.worstText
          ? config.worstText(worstCode, worstType, t)
          : '네 가지 성향 축이 모두 반대라 서로의 기준을 자주 확인해야 해요.';
        setHTML('r-worst', `
          <div class="pair__item">
            <span class="pair__code">${esc(worstCode)}</span>
            <span class="pair__why">${esc(worstType.nick)} — ${esc(why)}</span>
          </div>`);
      } else {
        setHTML('r-worst', '');
      }

      renderReview();
      show(el.result);
      recordResult();
    }

    /* ── 이벤트 ──────────────────────────────────── */
    function restart() {
      answers = new Array(questions.length).fill(null);
      cursor = 0;
      sessionId = randomId();
      finishedAt = null;
      lastScore = null;
      clear();
      el.resume.classList.add('is-hidden');
    }

    el.start.addEventListener('click', () => {
      const name = readName();
      if (!name) {
        flagName('이름을 입력해 주세요');
        return;
      }
      unflagName();
      testerName = name;
      el.name.value = name;
      restart();
      save();
      renderQuestion();
      show(el.quiz);
    });

    el.name.addEventListener('input', unflagName);
    el.name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); el.start.click(); }
    });

    el.resume.addEventListener('click', () => {
      const data = load();
      if (!data) return;
      answers = data.answers;
      cursor = Math.min(data.cursor, questions.length - 1);
      testerName = data.name || readName();
      sessionId = data.sessionId || randomId();
      if (!testerName) {
        flagName('이름을 입력해 주세요');
        return;
      }
      renderQuestion();
      show(el.quiz);
    });

    el.back.addEventListener('click', () => { if (cursor > 0) goTo(cursor - 1); });

    el.exit.addEventListener('click', () => {
      save();
      show(el.intro);
      el.resume.classList.remove('is-hidden');
      snack('여기까지 저장했어요. 이어서 하기로 돌아올 수 있어요');
    });

    optionEls.forEach((node) => {
      node.addEventListener('click', () => answer(node.dataset.side));
    });

    document.addEventListener('keydown', (e) => {
      if (!el.quiz.classList.contains('is-active')) return;
      if (e.key === '1') answer('A');
      else if (e.key === '2') answer('B');
      else if (e.key === 'ArrowLeft' && cursor > 0) goTo(cursor - 1);
    });

    el.restart.addEventListener('click', () => {
      restart();
      show(el.intro);
      el.name.focus();
    });

    el.share.addEventListener('click', async () => {
      const state = await shareResult(`${testLabel} 결과`, shortText());
      if (state === 'shared') snack('결과를 공유했어요');
      else if (state === 'copied') snack('공유 기능을 지원하지 않아 결과와 주소를 복사했어요');
      else if (state === 'failed') snack('공유에 실패했어요. 다시 시도해 주세요');
    });

    el.copyAll.addEventListener('click', async () => {
      snack(await copyText(fullText())
        ? '답변까지 전부 복사했어요'
        : '복사에 실패했어요. 다시 시도해 주세요');
    });

    /* ── 초기화 ──────────────────────────────────── */
    sessionId = randomId();
    const saved = load();
    if (saved) {
      if (saved.name) {
        testerName = saved.name;
        el.name.value = saved.name;
      }
      if (saved.answers.some(Boolean)) {
        el.resume.classList.remove('is-hidden');
        el.start.textContent = '처음부터 시작하기';
      }
    }
    renderQuestion();
  }

  return { mount };
})();
