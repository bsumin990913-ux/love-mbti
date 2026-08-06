/**
 * 구글 애드센스 — 승인이 나면 아래 두 줄만 채우면 켜진다.
 *
 * 채우기 전에는 아무 일도 하지 않는다. 승인 전에 로더를 부르면 콘솔에 오류만
 * 쌓이고 광고는 안 나오기 때문에, 아예 붙이지 않는 쪽을 택했다.
 * 그동안은 각 페이지에 이미 들어 있는 카카오 애드핏이 그대로 돈다.
 *
 * ── 켜는 순서 ─────────────────────────────────────
 *  1. adsense.google.com 가입 → 사이트 등록 → 승인 대기 (보통 며칠 ~ 2주)
 *  2. 승인되면 발급받은 게시자 ID를 PUB_ID 에 넣는다 ('ca-pub-' 로 시작한다)
 *     → 이것만으로 자동 광고가 돈다. 전면 광고(Vignette)도 여기 포함이다.
 *       애드센스 → 광고 → 사이트별 → 자동 광고 → '전면 광고' 를 켜 두면
 *       페이지를 넘길 때 구글이 알아서 전체 화면 광고를 띄운다.
 *  3. 화면 안 고정 자리에도 광고를 넣고 싶으면, 애드센스에서 '디스플레이 광고'
 *     단위를 하나 만들고 그 슬롯 번호를 SLOT_ID 에 넣는다.
 *     → 페이지마다 있는 .adslot 칸의 애드핏이 애드센스로 바뀐다.
 *
 * ── 하지 말아야 할 것 ─────────────────────────────
 *  '결과 보기'를 누르면 광고를 띄우고 광고를 닫아야 결과가 보이게 만드는 것.
 *  콘텐츠를 광고로 막는 행위라 애드센스 정책 위반이고 계정이 정지될 수 있다.
 *  같은 효과가 필요하면 위 2번의 자동 전면 광고를 쓰면 된다. 그건 구글이
 *  직접 띄우는 것이라 안전하다.
 */
(function () {
  'use strict';

  /* ── 여기만 고치면 됩니다 ──────────────────────── */
  const PUB_ID = '';    // 예: 'ca-pub-1234567890123456'
  const SLOT_ID = '';   // 예: '9876543210'  (비워두면 자동 광고만 돈다)
  /* ────────────────────────────────────────────── */

  if (!/^ca-pub-\d+$/.test(PUB_ID)) return;

  /* 1. 로더. 자동 광고·전면 광고가 이 한 줄에서 나온다 */
  const loader = document.createElement('script');
  loader.async = true;
  loader.crossOrigin = 'anonymous';
  loader.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${PUB_ID}`;
  document.head.appendChild(loader);

  if (!SLOT_ID) return;

  /* 2. 고정 자리 교체. 애드핏과 애드센스가 한 칸에서 겹치면 둘 다 손해라
        같은 자리에 하나만 남긴다 */
  function fillSlots() {
    document.querySelectorAll('.adslot').forEach((box) => {
      if (box.dataset.adsFilled) return;
      box.dataset.adsFilled = '1';

      box.querySelectorAll('.kakao_ad_area').forEach((el) => el.remove());

      const ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.setAttribute('data-ad-client', PUB_ID);
      ins.setAttribute('data-ad-slot', SLOT_ID);
      ins.setAttribute('data-ad-format', 'auto');
      ins.setAttribute('data-full-width-responsive', 'true');
      box.appendChild(ins);

      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (_) { /* 광고가 안 떠도 검사는 그대로 돌아야 한다 */ }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fillSlots);
  } else {
    fillSlots();
  }
})();
