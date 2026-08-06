/**
 * 썸메이트 연동 — 검사 결과를 소개팅 신청으로 넘겨준다.
 *
 * 넘기는 건 유형 코드 세 글자뿐이다. 이름·답변은 보내지 않는다.
 * 신원과 연락처는 썸메이트 신청서가 자기 동의 절차 안에서 따로 받는다.
 * 주소창에 개인정보를 싣지 않으려고 일부러 이렇게 나눠 뒀다.
 *
 * 배너를 고치고 싶으면 아래 '여기만 고치면 됩니다' 칸만 보면 된다.
 */
window.Partner = (function () {
  'use strict';

  /* ── 여기만 고치면 됩니다 ────────────────────────────

     APPLY_URL — 썸메이트 신청 폼 주소.
     썸메이트 관리자 화면 → 설정 → '신청 폼 주소'에 적힌 값을 그대로 붙여넣으세요.
     예: 'https://somemate.vercel.app/apply'

     비워두면 배너가 신청 폼 대신 스레드 계정으로 연결됩니다.
     주소를 모르는 채로 깨진 링크가 나가는 것보다 그 편이 낫습니다. */
  const APPLY_URL = 'https://ssomemate.vercel.app/apply';

  const THREADS_HANDLE = '@somemate_love';
  const THREADS_URL = 'https://www.threads.com/@somemate_love';
  /* ────────────────────────────────────────────────── */

  /** engine.js 의 LOCAL_RECORDS_KEY 와 같은 값이어야 한다 */
  const RECORDS_KEY = 'oneul-test/records/v1';
  const TEST_IDS = ['mbti', 'love', 'ideal'];
  const CODE_RE = /^[A-Z]{4}$/;

  const ready = () => Boolean(APPLY_URL);

  /**
   * 이 기기에 남은 검사 기록에서 검사별 '가장 최근' 유형 코드를 뽑는다.
   * localRecords() 가 최신순으로 쌓아 두므로 먼저 만난 쪽이 최신이다.
   */
  function latestCodes() {
    const out = {};
    let rows = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(RECORDS_KEY));
      if (Array.isArray(parsed)) rows = parsed;
    } catch (_) { /* 저장값이 깨졌으면 코드 없이 넘어간다 */ }

    for (const row of rows) {
      if (!row || out[row.test]) continue;
      if (!TEST_IDS.includes(row.test)) continue;
      if (!CODE_RE.test(String(row.code))) continue;
      out[row.test] = row.code;
    }
    return out;
  }

  /**
   * 신청 폼 주소를 만든다. 결과가 하나도 없으면 코드 없이 그냥 폼으로 보낸다.
   * src 는 썸메이트 쪽에서 '어떻게 알고 오셨나요'를 자동으로 채우는 데 쓴다.
   */
  function applyHref() {
    if (!ready()) return THREADS_URL;

    const codes = latestCodes();
    const params = new URLSearchParams({ src: 'oneul' });
    TEST_IDS.forEach((id) => { if (codes[id]) params.set(id, codes[id]); });

    return `${APPLY_URL}${APPLY_URL.includes('?') ? '&' : '?'}${params}`;
  }

  /**
   * 배너를 실제 주소에 연결한다.
   *
   * 누르는 순간에 다시 만드는 이유: 결과 화면이 그려질 때 기록이 저장되는데,
   * 배너는 그 전에 이미 문서에 들어와 있다. 미리 한 번 박아 두면 방금 끝낸
   * 검사가 빠진 주소가 나간다.
   */
  function mount() {
    const links = document.querySelectorAll('[data-partner-cta]');
    if (!links.length) return;

    links.forEach((a) => {
      a.href = applyHref();
      if (!ready()) {
        a.target = '_blank';
        a.rel = 'noopener';
        const go = a.querySelector('[data-partner-go]');
        if (go) go.textContent = `스레드 ${THREADS_HANDLE} 보러 가기`;
      }
    });

    /* 캡처 단계에서 먼저 잡아 주소를 갱신한 뒤 기본 동작(이동)이 이어지게 한다 */
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('[data-partner-cta]');
      if (a) a.href = applyHref();
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  return { applyHref, latestCodes, threadsUrl: THREADS_URL, handle: THREADS_HANDLE, ready };
})();
