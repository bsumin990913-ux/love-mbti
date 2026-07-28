(function () {
  'use strict';

  const BASE_URL = 'https://love-mbti-mu.vercel.app/types.html';
  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);

  const catalogs = {
    mbti: {
      label: '성격 검사',
      title: '16가지 성격 유형',
      detailLabel: '당신의 성격 유형',
      pairLabel: '잘 맞는 유형',
      worstLabel: '가장 안 맞는 유형',
      worstText: '생활 리듬과 판단 방식이 네 축 모두 반대라 서로를 이해하는 데 시간이 더 필요해요.',
      testUrl: './mbti.html',
      testCta: '성격 검사 시작하기',
      types: TYPES,
      axes: AXES,
    },
    love: {
      label: '연애 유형 검사',
      title: '16가지 연애 유형',
      detailLabel: '연애할 때의 유형',
      pairLabel: '잘 맞는 유형',
      worstLabel: '가장 안 맞는 유형',
      worstText: '관계의 거리와 표현 속도, 갈등을 다루는 방식이 모두 반대라 기대를 자주 확인해야 해요.',
      testUrl: './love.html',
      testCta: '연애 유형 검사 시작하기',
      types: LOVE_TYPES,
      axes: LOVE_AXES,
    },
    ideal: {
      label: '이상형 검사',
      title: '16가지 이상형 유형',
      detailLabel: '끌리는 사람의 유형',
      pairLabel: '취향이 겹치는 유형',
      worstLabel: '취향이 가장 먼 유형',
      worstText: '끌리는 온도와 관계 범위, 표현 방식과 주도권 취향이 네 축 모두 반대인 유형이에요.',
      testUrl: './ideal.html',
      testCta: '이상형 검사 시작하기',
      types: IDEAL_TYPES,
      axes: IDEAL_AXES,
    },
  };

  const params = new URLSearchParams(window.location.search);
  const testKey = catalogs[params.get('test')] ? params.get('test') : 'mbti';
  const catalog = catalogs[testKey];
  const requestedCode = (params.get('type') || '').toUpperCase();
  const selectedType = catalog.types[requestedCode] || null;

  document.body.dataset.test = testKey;
  document.querySelectorAll('[data-test-tab]').forEach((tab) => {
    const active = tab.dataset.testTab === testKey;
    tab.classList.toggle('is-active', active);
    if (active) tab.setAttribute('aria-current', 'page');
  });

  function oppositeCode(code) {
    const opposite = {};
    catalog.axes.forEach((axis) => {
      opposite[axis.left] = axis.right;
      opposite[axis.right] = axis.left;
    });
    return [...code].map((letter) => opposite[letter] || letter).join('');
  }

  function typeUrl(code) {
    return `./types.html?test=${encodeURIComponent(testKey)}&type=${encodeURIComponent(code)}`;
  }

  function renderList() {
    document.getElementById('catalog-label').textContent = catalog.label;
    document.getElementById('catalog-title').textContent = catalog.title;
    document.getElementById('type-grid').innerHTML = Object.entries(catalog.types)
      .map(([code, type]) => `
        <a class="type-card" href="${typeUrl(code)}"
           aria-label="${esc(code)} ${esc(type.nick)} 자세히 보기">
          <span class="type-card__code">${esc(code)}</span>
          <strong class="type-card__nick">${esc(type.nick)}</strong>
          <p class="type-card__tagline">${esc(type.tagline)}</p>
          <span class="type-card__more">자세히 보기</span>
        </a>`)
      .join('');
  }

  function axisMarkup(code) {
    return catalog.axes.map((axis, index) => {
      const letter = code[index];
      const name = letter === axis.left ? axis.leftName : axis.rightName;
      return `<div class="detail-axis"><b>${esc(letter)}</b> · ${esc(name)}</div>`;
    }).join('');
  }

  function pairMarkup(type) {
    return type.pair.map(([code, why]) => `
      <a class="detail-link" href="${typeUrl(code)}">
        <span class="detail-link__code">${esc(code)}</span>
        <span class="detail-link__text"><b>${esc(catalog.types[code].nick)}</b><br />${esc(why)}</span>
      </a>`).join('');
  }

  function renderDetail(code, type) {
    const worstCode = oppositeCode(code);
    const worstType = catalog.types[worstCode];
    const attachment = type.attachment
      ? `<span class="detail-hero__attach">${esc(type.attachment)}</span>`
      : '';

    const detail = document.getElementById('type-detail');
    detail.innerHTML = `
      <a class="detail-back" href="./types.html?test=${encodeURIComponent(testKey)}">${esc(catalog.title)} 전체 보기</a>
      <div class="detail-hero">
        <p class="detail-hero__label">${esc(catalog.detailLabel)}</p>
        <h2 class="detail-hero__code">${esc(code)}</h2>
        <h3 class="detail-hero__nick">${esc(type.nick)}</h3>
        <p class="detail-hero__tagline">${esc(type.tagline)}</p>
        ${attachment}
      </div>
      <div class="detail-axes">${axisMarkup(code)}</div>
      <section class="detail-card">
        <h3 class="detail-card__title">이런 유형이에요</h3>
        <p class="detail-card__body">${esc(type.desc)}</p>
      </section>
      <section class="detail-card">
        <h3 class="detail-card__title">이런 순간에 드러나요</h3>
        <ul class="detail-traits">${type.traits.map((trait) => `<li>${esc(trait)}</li>`).join('')}</ul>
      </section>
      <section class="detail-card">
        <h3 class="detail-card__title">이런 점은 살펴봐요</h3>
        <p class="detail-card__body">${esc(type.watch)}</p>
      </section>
      <section class="detail-card">
        <h3 class="detail-card__title">${esc(catalog.pairLabel)}</h3>
        <div class="detail-pairs">${pairMarkup(type)}</div>
      </section>
      <section class="detail-card">
        <h3 class="detail-card__title">${esc(catalog.worstLabel)}</h3>
        <div class="detail-pairs">
          <a class="detail-link" href="${typeUrl(worstCode)}">
            <span class="detail-link__code">${esc(worstCode)}</span>
            <span class="detail-link__text"><b>${esc(worstType.nick)}</b><br />${esc(catalog.worstText)}</span>
          </a>
        </div>
      </section>
      <a class="detail-cta" href="${catalog.testUrl}">${esc(catalog.testCta)}</a>`;

    detail.classList.remove('is-hidden');
    document.getElementById('catalog-list').classList.add('is-hidden');

    const pageTitle = `${code} ${type.nick} - ${catalog.label} 결과 | 오늘의 검사`;
    const description = `${code} ${type.nick}: ${type.tagline} ${type.desc}`;
    const canonical = `${BASE_URL}?test=${encodeURIComponent(testKey)}&type=${encodeURIComponent(code)}`;
    document.title = pageTitle;
    document.getElementById('meta-description').content = description.slice(0, 160);
    document.getElementById('canonical-link').href = canonical;
    document.getElementById('og-url').content = canonical;
    document.getElementById('og-title').content = pageTitle;
    document.getElementById('og-description').content = description.slice(0, 120);
    document.getElementById('twitter-title').content = pageTitle;
    document.getElementById('twitter-description').content = description.slice(0, 120);
  }

  renderList();
  if (selectedType) renderDetail(requestedCode, selectedType);
})();
