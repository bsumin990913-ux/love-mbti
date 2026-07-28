/**
 * 관리자 페이지.
 *
 * 저장된 기록에는 고른 극(pole) 배열만 들어 있다. 문항 본문은 questions.js /
 * love-questions.js 에서 인덱스로 맞춰 붙인다. 그래서 문항 카피를 고치면
 * 지난 기록의 표시도 같이 따라온다.
 *
 * 비밀번호는 sessionStorage 에만 둔다. 탭을 닫으면 다시 물어본다.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESCAPES[c]);

  const KEY_STORE = 'oneul-test/admin-key';
  const LOCAL_RECORDS_KEY = 'oneul-test/records/v1';

  const QUESTION_SETS = {
    mbti: typeof QUESTIONS !== 'undefined' ? QUESTIONS : [],
    love: typeof LOVE_QUESTIONS !== 'undefined' ? LOVE_QUESTIONS : [],
    ideal: typeof IDEAL_QUESTIONS !== 'undefined' ? IDEAL_QUESTIONS : [],
  };
  const TEST_LABELS = { mbti: '동네 성격 검사', love: '연애 유형 검사', ideal: '이상형 검사' };

  let adminKey = '';
  let records = [];
  let filterTest = 'all';
  let query = '';
  let current = null;
  let localOnly = false;   // 저장소 미연결 — 이 브라우저 기록만 보는 중

  /* ── 화면 ────────────────────────────────────── */
  const screens = document.querySelectorAll('.screen');
  function show(id) {
    screens.forEach((s) => s.classList.toggle('is-active', s.id === id));
    window.scrollTo(0, 0);
  }

  let snackTimer;
  function snack(message) {
    const bar = $('snackbar');
    bar.textContent = message;
    bar.classList.add('is-open');
    clearTimeout(snackTimer);
    snackTimer = setTimeout(() => bar.classList.remove('is-open'), 3000);
  }

  function formatDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '-';
    try {
      return new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      }).format(date);
    } catch (_) {
      return iso.slice(0, 16).replace('T', ' ');
    }
  }

  /* ── 서버 ────────────────────────────────────── */
  async function api(method, search) {
    const res = await fetch(`/api/results${search || ''}`, {
      method,
      headers: { 'x-admin-key': adminKey },
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  function readLocalRecords() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL_RECORDS_KEY));
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }

  /* ── 로그인 ──────────────────────────────────── */
  function loginError(message) {
    $('login-error').textContent = message;
    $('admin-key').classList.toggle('is-invalid', Boolean(message));
  }

  async function attemptLogin(key) {
    const button = $('btn-login');
    button.disabled = true;
    button.textContent = '확인 중…';
    loginError('');

    try {
      adminKey = key;
      const { ok, status, data } = await api('GET');

      if (ok) {
        try { sessionStorage.setItem(KEY_STORE, key); } catch (_) {}
        localOnly = false;
        records = data.records || [];
        enterList();
        return;
      }

      adminKey = '';
      if (status === 401) {
        loginError('비밀번호가 맞지 않아요');
      } else if (status === 503) {
        $('setup-guide').classList.remove('is-hidden');
        loginError(data.reason === 'password'
          ? 'ADMIN_PASSWORD 환경변수가 아직 없어요'
          : '저장소가 아직 연결되지 않았어요');
      } else if (status === 404) {
        // 정적 서버로 열었을 때. /api 자체가 없다
        $('setup-guide').classList.remove('is-hidden');
        loginError('서버 기능(/api)이 없는 환경이에요');
      } else {
        loginError('불러오지 못했어요. 잠시 뒤 다시 시도해 주세요');
      }
    } catch (_) {
      // /api 가 없는 환경(로컬 정적 서버 등)
      adminKey = '';
      $('setup-guide').classList.remove('is-hidden');
      loginError('서버에 연결하지 못했어요');
    } finally {
      button.disabled = false;
      button.textContent = '들어가기';
    }
  }

  function enterLocalOnly() {
    localOnly = true;
    records = readLocalRecords();
    enterList();
  }

  function enterList() {
    const banner = $('local-banner');
    banner.classList.toggle('is-hidden', !localOnly);
    if (localOnly) {
      banner.textContent = '저장소 미연결 — 이 브라우저에 남은 기록만 보고 있어요.';
    }
    $('btn-wipe').classList.toggle('is-hidden', localOnly);
    renderList();
    show('screen-list');
  }

  /* ── 목록 ────────────────────────────────────── */
  function visibleRecords() {
    const q = query.trim().toLowerCase();
    return records.filter((r) => {
      if (filterTest !== 'all' && r.test !== filterTest) return false;
      if (q && !String(r.name || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function renderList() {
    const rows = visibleRecords();

    const counts = records.reduce((acc, r) => {
      acc[r.test] = (acc[r.test] || 0) + 1;
      return acc;
    }, {});
    $('list-meta').textContent = records.length
      ? `전체 ${records.length}명 · 성격 ${counts.mbti || 0} · 연애 ${counts.love || 0} · 이상형 ${counts.ideal || 0}`
      : '아직 기록이 없어요';

    $('empty').classList.toggle('is-hidden', rows.length > 0);
    $('empty').textContent = records.length
      ? '조건에 맞는 기록이 없어요.'
      : '아직 기록이 없어요.';

    $('rows').innerHTML = rows.map((r) => `
      <li>
        <button class="row" type="button" data-id="${esc(r.sessionId)}">
          <span class="row__main">
            <span class="row__name">${esc(r.name)}</span>
            <span class="row__date">${esc(formatDate(r.createdAt))}</span>
          </span>
          <span class="row__side">
            <span class="row__tag row__tag--${esc(r.test)}">${esc(TEST_LABELS[r.test] || r.test)}</span>
            <span class="row__code">${esc(r.code)}</span>
            <span class="row__nick">${esc(r.nick)}</span>
          </span>
        </button>
      </li>`).join('');
  }

  /* ── 상세 ────────────────────────────────────── */

  /** 저장된 극 배열을 원본 문항과 맞춰 하나씩 되살린다 */
  function answerRows(record) {
    const questions = QUESTION_SETS[record.test] || [];
    const answers = record.answers || [];

    // 문항을 고쳐서 개수가 달라졌으면 본문을 붙일 수 없다
    if (questions.length !== answers.length) return null;

    return answers.map((pole, i) => {
      const q = questions[i];
      const mine = q.a.p === pole ? q.a : q.b;
      const other = q.a.p === pole ? q.b : q.a;
      return { no: i + 1, scene: q.scene, q: q.q, pole, picked: mine.t, skipped: other.t };
    });
  }

  function renderDetail(record) {
    current = record;
    const rows = answerRows(record);

    const tally = (record.answers || []).reduce((acc, p) => {
      acc[p] = (acc[p] || 0) + 1;
      return acc;
    }, {});
    const tallyText = Object.keys(tally).sort().map((p) => `${p} ${tally[p]}`).join(' · ');

    const body = rows
      ? rows.map((r) => `
          <li class="review__item">
            <p class="review__scene"><span class="review__no">${r.no}</span>${esc(r.scene)}</p>
            <p class="review__q">${esc(r.q)}</p>
            <p class="review__pick">
              <span class="review__pole">${esc(r.pole)}</span>
              <span>${esc(r.picked)}</span>
            </p>
            <p class="review__skip">${esc(r.skipped)}</p>
          </li>`).join('')
      : `<li class="review__item"><p class="review__q">
           저장된 응답 ${esc((record.answers || []).length)}개가 지금 문항 수와 달라
           문항 본문을 붙일 수 없어요. 고른 값: ${esc((record.answers || []).join(' '))}
         </p></li>`;

    $('detail').innerHTML = `
      <div class="card">
        <p class="detail__eyebrow">${esc(TEST_LABELS[record.test] || record.test)}</p>
        <h2 class="detail__name">${esc(record.name)}</h2>
        <dl class="detail__facts">
          <div><dt>유형</dt><dd>${esc(record.code)} · ${esc(record.nick)}</dd></div>
          <div><dt>검사일</dt><dd>${esc(formatDate(record.createdAt))}</dd></div>
          <div><dt>선택 분포</dt><dd>${esc(tallyText)}</dd></div>
        </dl>
        <div class="detail__actions">
          <button class="btn btn--chip" type="button" id="btn-copy-one">답변 복사</button>
          <button class="btn btn--chip" type="button" id="btn-txt-one">txt 저장</button>
        </div>
      </div>

      <div class="card">
        <h3 class="card__title">고른 답 ${esc((record.answers || []).length)}개</h3>
        <ol class="review__list">${body}</ol>
      </div>`;

    $('btn-copy-one').addEventListener('click', async () => {
      snack(await copyText(recordText(record)) ? '복사했어요' : '복사에 실패했어요');
    });
    $('btn-txt-one').addEventListener('click', () => {
      downloadText(`${safePart(record.name)}_${record.code}.txt`, recordText(record));
    });

    show('screen-detail');
  }

  /* ── 내보내기 ────────────────────────────────── */
  function recordText(record) {
    const rows = answerRows(record);
    const out = [
      `${TEST_LABELS[record.test] || record.test} 결과`,
      '='.repeat(28),
      `이름: ${record.name}`,
      `유형: ${record.code} · ${record.nick}`,
      `검사일: ${formatDate(record.createdAt)}`,
      '',
      '[고른 답]',
    ];
    if (rows) {
      rows.forEach((r) => out.push(`${r.no}. ${r.scene}\n   ${r.q}\n   → ${r.picked} (${r.pole})`, ''));
    } else {
      out.push((record.answers || []).join(' '));
    }
    return out.join('\n');
  }

  /** 앞이 =,+,-,@ 인 값은 엑셀이 수식으로 읽는다 */
  function csvCell(value) {
    let text = String(value == null ? '' : value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function buildCsv() {
    const questionMax = Math.max(
      ...visibleRecords().map((r) => (r.answers || []).length), 0,
    );
    const header = ['검사', '이름', '유형', '별명', '검사일'];
    for (let i = 1; i <= questionMax; i += 1) header.push(`Q${i}`);

    const lines = [header.map(csvCell).join(',')];
    visibleRecords().forEach((r) => {
      const cells = [
        TEST_LABELS[r.test] || r.test,
        r.name,
        r.code,
        r.nick,
        formatDate(r.createdAt),
        ...(r.answers || []),
      ];
      lines.push(cells.map(csvCell).join(','));
    });
    return lines.join('\r\n');
  }

  const safePart = (v) => String(v).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 30);
  const stamp = () => new Date().toISOString().slice(0, 10);

  function downloadText(filename, text, mime) {
    // BOM 이 있어야 엑셀이 한글 CSV 를 UTF-8 로 연다
    const blob = new Blob(['﻿' + text], { type: `${mime || 'text/plain'};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

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
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (_) { return false; }
  }

  /* ── 이벤트 ──────────────────────────────────── */
  $('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const key = $('admin-key').value;
    if (!key) { loginError('비밀번호를 입력해 주세요'); return; }
    attemptLogin(key);
  });
  $('admin-key').addEventListener('input', () => loginError(''));
  $('btn-local').addEventListener('click', enterLocalOnly);

  $('search').addEventListener('input', (e) => {
    query = e.target.value;
    renderList();
  });

  $('filters').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    filterTest = chip.dataset.test;
    $('filters').querySelectorAll('.chip')
      .forEach((c) => c.classList.toggle('is-on', c === chip));
    renderList();
  });

  $('rows').addEventListener('click', (e) => {
    const row = e.target.closest('.row');
    if (!row) return;
    const record = records.find((r) => r.sessionId === row.dataset.id);
    if (record) renderDetail(record);
  });

  $('btn-back-list').addEventListener('click', () => show('screen-list'));

  $('btn-reload').addEventListener('click', async () => {
    if (localOnly) {
      records = readLocalRecords();
      renderList();
      snack('새로고침했어요');
      return;
    }
    const { ok, data } = await api('GET');
    if (!ok) { snack('불러오지 못했어요'); return; }
    records = data.records || [];
    renderList();
    snack('새로고침했어요');
  });

  $('btn-csv').addEventListener('click', () => {
    if (!visibleRecords().length) { snack('내보낼 기록이 없어요'); return; }
    downloadText(`검사응답_${stamp()}.csv`, buildCsv(), 'text/csv');
  });

  $('btn-json').addEventListener('click', () => {
    if (!visibleRecords().length) { snack('내보낼 기록이 없어요'); return; }
    downloadText(`검사응답_${stamp()}.json`,
      JSON.stringify(visibleRecords(), null, 2), 'application/json');
  });

  $('btn-delete').addEventListener('click', async () => {
    if (!current) return;
    if (!window.confirm(`${current.name}님의 기록을 지울까요? 되돌릴 수 없어요.`)) return;

    if (localOnly) {
      records = records.filter((r) => r.sessionId !== current.sessionId);
      try { localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(records)); } catch (_) {}
    } else {
      const { ok } = await api('DELETE', `?id=${encodeURIComponent(current.sessionId)}`);
      if (!ok) { snack('삭제하지 못했어요'); return; }
      records = records.filter((r) => r.sessionId !== current.sessionId);
    }
    current = null;
    renderList();
    show('screen-list');
    snack('삭제했어요');
  });

  $('btn-wipe').addEventListener('click', async () => {
    if (!records.length) { snack('지울 기록이 없어요'); return; }
    if (!window.confirm(`기록 ${records.length}건을 전부 지울까요? 되돌릴 수 없어요.`)) return;
    if (!window.confirm('정말 전부 지웁니다. 계속할까요?')) return;

    const { ok } = await api('DELETE', '?all=1');
    if (!ok) { snack('삭제하지 못했어요'); return; }
    records = [];
    renderList();
    snack('전부 삭제했어요');
  });

  /* ── 초기화 ──────────────────────────────────── */
  let saved = '';
  try { saved = sessionStorage.getItem(KEY_STORE) || ''; } catch (_) {}
  if (saved) {
    $('admin-key').value = saved;
    attemptLogin(saved);
  }
})();
