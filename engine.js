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

  /* ── 결과 이미지 ─────────────────────────────────
     스토리에 그대로 올라가는 세로 카드. 9:16 이라 인스타·카톡 어디에 올려도
     잘리지 않는다.

     DOM 캡처 라이브러리(html2canvas 등)를 쓰지 않고 캔버스에 직접 그린다.
     이 사이트는 빌드 단계가 없어서 외부 스크립트를 하나 더 붙이면 결과 화면의
     체감 속도가 그만큼 늦어지고, DOM 캡처는 브라우저마다 폰트·그림자 해석이
     달라 결과물이 흔들린다. 그릴 게 텍스트와 막대뿐이라 손해가 없다. */
  const CARD_W = 1080;
  const CARD_H = 1920;

  const FONT_STACK = '-apple-system, BlinkMacSystemFont, "Pretendard Variable", ' +
                     'Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  const font = (weight, size) => `${weight} ${size}px ${FONT_STACK}`;

  /** 화면에서 쓰는 색을 그대로 가져온다. 검사마다 테마가 달라도 이미지가 따라간다 */
  function themeColors() {
    const cs = getComputedStyle(document.body);
    const pick = (name, fallback) => (cs.getPropertyValue(name).trim() || fallback);
    return {
      bg:     pick('--background', '#f2f3f6'),
      canvas: pick('--canvas', '#ffffff'),
      fg:     pick('--foreground', '#212124'),
      muted:  pick('--text-secondary', '#686d75'),
      accent: pick('--primary-text', '#a34205'),
      fill:   pick('--primary', '#ff6f0f'),
      track:  pick('--gray-200', '#eaebee'),
      tint:   pick('--brand-tint', '#fff5f0'),
      faint:  pick('--gray-500', '#adb1ba'),
    };
  }

  /** ctx.roundRect 는 사파리 16 미만에 없다 */
  function roundRect(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  /**
   * 유형 캐릭터 그림을 읽는다. 아직 그림이 없는 유형이 있어서(char/web/<검사>/)
   * 못 읽는 건 오류가 아니다 — null 을 돌려주고 화면과 저장 이미지 양쪽에서
   * 그 자리를 통째로 뺀다.
   */
  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  /** 어절 단위 줄바꿈. 낱글자가 줄 끝에 혼자 떨어지지 않게 한다 (CSS 쪽과 같은 규칙) */
  function wrapLines(ctx, text, maxWidth) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    return lines;
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
      start:     $('btn-start'),
      resume:    $('btn-resume'),
      back:      $('btn-back'),
      exit:      $('btn-exit'),
      share:     $('btn-share'),
      saveImg:   $('btn-save'),
      copyAll:   $('btn-copy-answers'),
      restart:   $('btn-restart'),
      char:      $('r-char'),
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

    /* ── 이름 ──────────────────────────────────────
       선택 입력이다. 심리 테스트를 하러 온 사람에게 시작 전 이름을 요구하면
       거기서 돌아선다. 넣은 사람에게만 결과에 "○○님,"이 붙는다 */
    function readName() {
      return (el.name.value || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
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

    /**
     * 결과 카드의 제목을 그대로 가져다 쓴다. 검사마다 문구가 달라서 복제하지 않는다.
     * 요약 카드처럼 .card__title 이 없는 자리는 data-report-title 로 이름을 적어둔다.
     */
    function titleOf(id) {
      const holder = $(id) && $(id).closest('[data-report-title], .card');
      if (!holder) return '';
      if (holder.dataset.reportTitle) return holder.dataset.reportTitle;
      const heading = holder.querySelector('.card__title');
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
      if (testerName) out.push(`이름: ${testerName}`);
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

    /* ── 결과 이미지 ─────────────────────────────── */

    /**
     * 요약 카드와 같은 구성을 1080×1920 캔버스에 그린다.
     * 화면(.sharecard)과 순서를 맞춰둘 것 — 한쪽만 바꾸면 저장한 이미지와
     * 눈으로 본 결과가 달라진다.
     */
    async function drawCard() {
      const { code, bars } = lastScore;
      const t = types[code];
      const c = themeColors();
      /* 화면에 이미 떠 있는 그림이라 브라우저 캐시에서 바로 온다 */
      const charImage = config.charSrc ? await loadImage(config.charSrc(code)) : null;

      const canvas = document.createElement('canvas');
      canvas.width = CARD_W;
      canvas.height = CARD_H;
      const ctx = canvas.getContext('2d');

      const MARGIN = 56;   // 카드 바깥 여백
      const PAD = 88;      // 카드 안쪽 여백
      const cardW = CARD_W - MARGIN * 2;
      const innerW = cardW - PAD * 2;
      const leftX = MARGIN + PAD;
      const rightX = leftX + innerW;
      const cx = CARD_W / 2;

      ctx.fillStyle = c.bg;
      ctx.fillRect(0, 0, CARD_W, CARD_H);
      roundRect(ctx, MARGIN, MARGIN, cardW, CARD_H - MARGIN * 2, 48);
      ctx.fillStyle = c.canvas;
      ctx.fill();

      /* 화면의 안내 문구를 그대로 쓴다. "당신의 유형은 / 연애할 때의 당신은" 처럼
         검사마다 달라서 여기서 다시 쓰지 않는다 */
      const eyebrowNode = document.querySelector('.sharecard .result__eyebrow');
      const eyebrow = eyebrowNode ? eyebrowNode.textContent.replace(/\s+/g, ' ').trim() : '';
      const attach = (t.attachment || '').trim();

      /* 닉네임·한 줄은 길이가 제각각이라, 먼저 줄 수를 재서 전체 높이를 구하고
         세로 가운데에 맞춘다. 그래야 짧은 유형에서 위쪽에 몰려 보이지 않는다 */
      ctx.font = font(700, 62);
      const nickLines = wrapLines(ctx, t.nick, innerW);
      ctx.font = font(400, 36);
      const taglineLines = wrapLines(ctx, t.tagline, innerW);

      /* 화면(128px)보다 크게 잡는다. 화면은 저장·공유 버튼까지 첫 화면에
         들어와야 해서 눌러둔 값이고, 여기는 스토리에 올라가는 그림이라
         캐릭터가 주인공이어야 한다 */
      const CHAR = 430;                          // 캐릭터 한 변

      /* 지표 한 칸의 세로 배분. 글자 기준선 -> 막대 -> 다음 글자 기준선 순서로,
         막대 아래를 위보다 넉넉하게 준다. 같은 값으로 두면 막대가 자기 이름이
         아니라 아래 축 이름에 붙어 보인다 */
      const BAR_LABEL_GAP = 30;                  // 글자 기준선 -> 막대 위
      const BAR_TRACK = 16;                      // 막대 두께
      const BAR_TAIL = 62;                       // 막대 아래 -> 다음 글자 기준선
      const H_BAR = BAR_LABEL_GAP + BAR_TRACK + BAR_TAIL;
      const height = 78                          // eyebrow
        + (charImage ? CHAR + 40 : 0)            // 캐릭터
        + 190                                    // code
        + nickLines.length * 84
        + taglineLines.length * 54 + 16
        + (attach ? 96 : 0)
        + 72 + bars.length * H_BAR               // 지표
        + 56;                                    // 키워드 칩
      let y = Math.max(MARGIN + 120, (CARD_H - height) / 2 - 40);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';

      ctx.font = font(400, 34);
      ctx.fillStyle = c.muted;
      ctx.fillText(eyebrow, cx, y);
      y += 78;

      /* 모서리 비율은 화면과 맞춘다 — 128px 에 20px 이니 430px 에서는 67px.
         배경이 있는 그림이라 안 깎으면 사각형이 그대로 튄다 */
      if (charImage) {
        ctx.save();
        roundRect(ctx, cx - CHAR / 2, y, CHAR, CHAR, 67);
        ctx.clip();
        ctx.drawImage(charImage, cx - CHAR / 2, y, CHAR, CHAR);
        ctx.restore();
        y += CHAR + 40;
      }

      ctx.font = font(700, 150);
      ctx.fillStyle = c.accent;
      ctx.fillText(code, cx, y + 110);
      y += 190;

      ctx.font = font(700, 62);
      ctx.fillStyle = c.fg;
      nickLines.forEach((line) => { ctx.fillText(line, cx, y); y += 84; });

      ctx.font = font(400, 36);
      ctx.fillStyle = c.muted;
      taglineLines.forEach((line) => { ctx.fillText(line, cx, y); y += 54; });
      y += 16;

      if (attach) {
        ctx.font = font(700, 30);
        const w = ctx.measureText(attach).width + 64;
        roundRect(ctx, cx - w / 2, y, w, 60, 30);
        ctx.fillStyle = c.tint;
        ctx.fill();
        ctx.fillStyle = c.accent;
        ctx.fillText(attach, cx, y + 40);
        y += 96;
      }

      /* 화면과 같이 백분율을 축 이름 옆에 붙인다 (styles.css .bar__pct 참고) */
      y += 72;
      bars.forEach(({ axis, leftPct, rightPct }) => {
        const leftWins = leftPct >= rightPct;

        ctx.textAlign = 'left';
        ctx.font = font(leftWins ? 700 : 400, 30);
        ctx.fillStyle = leftWins ? c.fg : c.muted;
        ctx.fillText(`${axis.left} · ${axis.leftName} ${leftPct}%`, leftX, y);

        ctx.textAlign = 'right';
        ctx.font = font(leftWins ? 400 : 700, 30);
        ctx.fillStyle = leftWins ? c.muted : c.fg;
        ctx.fillText(`${rightPct}% ${axis.rightName} · ${axis.right}`, rightX, y);
        y += BAR_LABEL_GAP;

        const r = BAR_TRACK / 2;
        roundRect(ctx, leftX, y, innerW, BAR_TRACK, r);
        ctx.fillStyle = c.track;
        ctx.fill();
        const w = Math.round((innerW * (leftWins ? leftPct : rightPct)) / 100);
        roundRect(ctx, leftWins ? leftX : rightX - w, y, w, BAR_TRACK, r);
        ctx.fillStyle = c.fill;
        ctx.fill();
        y += BAR_TRACK + BAR_TAIL;
      });

      /* 우세한 쪽 축 이름을 해시태그로. 화면의 .sharecard__keys 와 같은 값이다 */
      const CHIP_H = 56;
      ctx.font = font(700, 30);
      const chips = bars.map(({ axis, leftPct, rightPct }) =>
        `#${leftPct >= rightPct ? axis.leftName : axis.rightName}`);
      const chipW = chips.map((label) => ctx.measureText(label).width + 52);
      const chipsW = chipW.reduce((a, b) => a + b, 0) + 16 * (chips.length - 1);
      let chipX = cx - chipsW / 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      chips.forEach((label, i) => {
        roundRect(ctx, chipX, y, chipW[i], CHIP_H, 28);
        ctx.fillStyle = c.tint;
        ctx.fill();
        ctx.fillStyle = c.accent;
        ctx.fillText(label, chipX + chipW[i] / 2, y + 29);
        chipX += chipW[i] + 16;
      });
      ctx.textBaseline = 'alphabetic';
      y += CHIP_H;

      /* 브랜드 문구는 원래 카드 바닥에서 고정 거리에 그렸는데, 캐릭터가 들어가면서
         내용이 이 위치까지 늘어날 수 있어 칩과 겹쳤다. 짧은 결과에서는 그대로
         바닥에 붙이고, 내용이 길면 칩 아래로 밀어낸다. 그래도 카드 테두리
         안쪽(URL 줄까지 포함)은 벗어나지 않도록 마지막에 한 번 더 눌러준다 */
      const footerY = Math.min(
        Math.max(CARD_H - MARGIN - 128, y + 64),
        CARD_H - MARGIN - 60,
      );
      ctx.textAlign = 'center';
      ctx.font = font(700, 28);
      ctx.fillStyle = c.muted;
      ctx.fillText('오늘의 검사', cx, footerY);
      ctx.font = font(400, 26);
      ctx.fillStyle = c.faint;
      ctx.fillText(currentPageUrl().replace(/^https?:\/\//, ''), cx, footerY + 42);

      return canvas;
    }

    /**
     * 지원하는 기기에서는 공유 시트로 바로 넘긴다 — 인스타 스토리는 파일 공유만
     * 받기 때문에, 텍스트 공유로는 애초에 올릴 수가 없다. 미지원이면 내려받는다.
     */
    async function saveImage() {
      if (!lastScore) return;

      let blob;
      try {
        const canvas = await drawCard();
        blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      } catch (_) { /* 아래에서 실패로 처리 */ }

      if (!blob) {
        snack('이미지를 만들지 못했어요. 결과를 캡처해 주세요');
        return;
      }

      const filename = `${testLabel}-${lastScore.code}.png`;
      try {
        const file = new File([blob], filename, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
          return;
        }
      } catch (error) {
        if (error && error.name === 'AbortError') return;
        /* 공유가 막힌 브라우저 — 내려받기로 물러선다 */
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      snack('결과 이미지를 저장했어요');
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
        /* 이름은 선택 입력이라 비어 있을 수 있다. 관리자 화면이 목록·상세·파일명에
           그대로 쓰기 때문에 빈 문자열 대신 표시용 값을 넣는다 */
        name: testerName || '이름 없음',
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

      /* 유형 캐릭터. 그림이 없는 유형은 src 를 비워 자리까지 없앤다
         (styles.css .sharecard__char:not([src])) */
      if (el.char) {
        el.char.removeAttribute('src');
        el.char.alt = '';
        if (config.charSrc) {
          el.char.alt = `${code} 캐릭터`;
          el.char.onerror = () => { el.char.removeAttribute('src'); el.char.alt = ''; };
          el.char.src = config.charSrc(code);
        }
      }

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
                ${axis.left} · ${axis.leftName} <i class="bar__pct">${leftPct}%</i>
                <small>${axis.leftDesc}</small>
              </span>
              <span class="bar__side ${leftWins ? '' : 'is-win'}" style="text-align:right">
                <i class="bar__pct">${rightPct}%</i> ${axis.rightName} · ${axis.right}
                <small>${axis.rightDesc}</small>
              </span>
            </div>
            <div class="bar__track">
              <div class="bar__fill${leftWins ? '' : ' bar__fill--right'}"
                   style="width:${leftWins ? leftPct : rightPct}%"></div>
            </div>
            ${leftPct === rightPct ? '<p class="bar__tie">거의 반반이에요</p>' : ''}
          </div>`;
      }).join(''));

      /* 우세한 쪽 축 이름을 해시태그로. 저장 이미지의 칩과 같은 값이다 */
      setHTML('r-keys', bars.map(({ axis, leftPct, rightPct }) =>
        `<li>#${esc(leftPct >= rightPct ? axis.leftName : axis.rightName)}</li>`).join(''));

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
      testerName = readName();
      el.name.value = testerName;
      restart();
      save();
      renderQuestion();
      show(el.quiz);
    });

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

    el.saveImg.addEventListener('click', async () => {
      el.saveImg.disabled = true;
      try { await saveImage(); } finally { el.saveImg.disabled = false; }
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
