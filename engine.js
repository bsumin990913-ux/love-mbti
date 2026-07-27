/**
 * 두 검사(성격 / 연애)가 공유하는 문항 진행·채점 엔진.
 * 화면 구조(id)는 동일하고, 문항·유형·카피만 config로 주입한다.
 */
window.QuizEngine = (function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const setText = (id, value) => { const n = $(id); if (n) n.textContent = value; };
  const setHTML = (id, value) => { const n = $(id); if (n) n.innerHTML = value; };

  function mount(config) {
    const { storageKey, questions, types, axes } = config;

    const el = {
      screens:  document.querySelectorAll('.screen'),
      intro:    $('screen-intro'),
      quiz:     $('screen-quiz'),
      result:   $('screen-result'),
      start:    $('btn-start'),
      resume:   $('btn-resume'),
      back:     $('btn-back'),
      exit:     $('btn-exit'),
      share:    $('btn-share'),
      restart:  $('btn-restart'),
      progress: $('progress-fill'),
      quizBody: document.querySelector('.quiz'),
      snackbar: $('snackbar'),
    };
    const optionEls = $('q-options').querySelectorAll('.option');

    /** answers[i] = 해당 문항에서 고른 극 문자 */
    let answers = new Array(questions.length).fill(null);
    let cursor = 0;
    let locked = false; // 자동 전환 중 중복 입력 차단

    /* ── 저장 ────────────────────────────────────── */
    function save() {
      try { localStorage.setItem(storageKey, JSON.stringify({ answers, cursor })); }
      catch (_) { /* 시크릿 모드 등 — 저장이 안 돼도 검사는 동작한다 */ }
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
    function showResult() {
      const { code, bars } = score();
      const t = types[code];

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

      show(el.result);
    }

    /* ── 이벤트 ──────────────────────────────────── */
    function restart() {
      answers = new Array(questions.length).fill(null);
      cursor = 0;
      clear();
      el.resume.classList.add('is-hidden');
    }

    el.start.addEventListener('click', () => {
      restart();
      renderQuestion();
      show(el.quiz);
    });

    el.resume.addEventListener('click', () => {
      const data = load();
      if (!data) return;
      answers = data.answers;
      cursor = Math.min(data.cursor, questions.length - 1);
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
    });

    el.share.addEventListener('click', async () => {
      const code = $('r-code').textContent;
      try {
        await navigator.clipboard.writeText(config.shareText(code, types[code]));
        snack('결과를 복사했어요');
      } catch (_) {
        snack('복사에 실패했어요. 다시 시도해 주세요');
      }
    });

    /* ── 초기화 ──────────────────────────────────── */
    const saved = load();
    if (saved && saved.answers.some(Boolean)) {
      el.resume.classList.remove('is-hidden');
      el.start.textContent = '처음부터 시작하기';
    }
    renderQuestion();
  }

  return { mount };
})();
