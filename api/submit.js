/**
 * POST /api/submit — 검사 결과 한 건을 저장한다.
 *
 * 문항 본문은 보내지 않는다. 고른 극(pole) 배열만 저장하고, 관리자 페이지가
 * questions.js / love-questions.js 를 읽어 문항과 맞춰 보여준다.
 * 저장 용량이 훨씬 줄고, 문항 카피를 고쳐도 기록이 따라 바뀐다.
 *
 * sessionId 로 덮어쓰기(upsert)한다. 결과를 본 뒤 뒤로 가서 답을 고쳐도
 * 같은 사람의 기록이 여러 줄로 늘어나지 않는다.
 */
import { HASH_KEY, command, isConfigured, json, pruneIfNeeded } from './_store.js';

const TESTS = {
  mbti: '성격 검사', love: '연애 유형 검사', ideal: '이상형 검사', sai: '관계 반응',
};

const NAME_MAX = 20;
const ANSWERS_MAX = 100;

/* 관계 반응 검사(sai) 전용 상한. 답이 극(pole) 한 글자가 아니라
   선택 id·자유 서술·숫자가 섞여 있어서 따로 잰다 */
const SAI_ID_MAX = 40;       // 선택지 id 하나
const SAI_LIST_MAX = 12;     // 복수 선택·순서 정렬의 항목 수
const SAI_REPLY_MAX = 200;   // 자유 서술 (입력란은 160자, 여유를 둔다)

const str = (v) => (typeof v === 'string' ? v : '');

/** 제어문자를 걸러낸다. 목록·CSV 가 줄바꿈 하나로 깨지는 걸 막는다 */
function stripControl(text) {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code > 31 && code !== 127) out += ch;
  }
  return out;
}

/** 성격·연애·이상형 검사: 고른 극(pole) 한 글자의 배열 */
function poleAnswers(body) {
  const answers = Array.isArray(body.answers) ? body.answers : null;
  if (!answers || !answers.length || answers.length > ANSWERS_MAX) {
    return { error: '응답 개수가 올바르지 않아요' };
  }
  if (!answers.every((a) => typeof a === 'string' && /^[A-Z]$/.test(a))) {
    return { error: '응답 값이 올바르지 않아요' };
  }
  return { answers, total: answers.length };
}

/** 여러 줄로 온 서술형을 한 줄로 접는다. 목록·CSV 가 줄바꿈으로 깨지지 않게 */
const oneLine = (text) => stripControl(text.replace(/\s+/g, ' ')).trim();

/**
 * 관계 반응 검사: 문항 인덱스를 키로 하는 객체다. 배열이 아닌 이유는
 * 1번(순서 정렬)이 조건부라 인덱스가 빌 수 있기 때문이다 — 배열이면 뒤가 밀린다.
 *
 * 값은 타입마다 모양이 다르다. 선택 id 문자열, id 배열, 자유 서술, 0~100 숫자.
 * 서버는 문항 정의를 갖고 있지 않으므로 id 가 실재하는지는 보지 않고 크기만 잰다.
 */
function saiAnswers(body) {
  const raw = body.answers;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: '응답 형식이 올바르지 않아요' };
  }

  const keys = Object.keys(raw);
  if (!keys.length || keys.length > ANSWERS_MAX) {
    return { error: '응답 개수가 올바르지 않아요' };
  }

  const answers = {};
  for (const key of keys) {
    if (!/^\d{1,3}$/.test(key) || Number(key) >= ANSWERS_MAX) {
      return { error: '문항 번호가 올바르지 않아요' };
    }
    const value = raw[key];

    if (typeof value === 'string') {
      answers[key] = oneLine(value).slice(0, SAI_REPLY_MAX);
    } else if (Array.isArray(value)) {
      if (value.length > SAI_LIST_MAX) return { error: '선택 항목이 너무 많아요' };
      if (!value.every((v) => typeof v === 'string')) {
        return { error: '응답 값이 올바르지 않아요' };
      }
      answers[key] = value.map((v) => oneLine(v).slice(0, SAI_ID_MAX));
    } else if (typeof value === 'number') {
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        return { error: '응답 값이 올바르지 않아요' };
      }
      answers[key] = Math.round(value);
    } else {
      return { error: '응답 값이 올바르지 않아요' };
    }
  }

  return { answers, total: keys.length };
}

/** 0~100 정수만 통과시킨다. 아니면 기록에서 뺀다 */
function saiScores(value) {
  if (!value || typeof value !== 'object') return null;
  const out = {};
  for (const key of ['anxiety', 'avoidance']) {
    const n = value[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100) return null;
    out[key] = Math.round(n);
  }
  return out;
}

function validate(body) {
  const test = str(body.test);
  if (!TESTS[test]) return { error: '알 수 없는 검사예요' };

  const name = stripControl(str(body.name)).trim().slice(0, NAME_MAX);
  if (!name) return { error: '이름이 없어요' };

  const code = str(body.code);
  if (!/^[A-Z]{4}$/.test(code)) return { error: '유형 코드가 올바르지 않아요' };

  const { answers, total, error: answersError } =
    test === 'sai' ? saiAnswers(body) : poleAnswers(body);
  if (answersError) return { error: answersError };

  const sessionId = str(body.sessionId).slice(0, 40);
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(sessionId)) return { error: '세션 값이 올바르지 않아요' };

  const record = {
    test,
    testLabel: TESTS[test],
    name,
    code,
    nick: stripControl(str(body.nick)).slice(0, 40),
    answers,
    total,
    createdAt: new Date().toISOString(),
  };

  if (test === 'sai') {
    const scores = saiScores(body.scores);
    if (scores) record.scores = scores;
  }

  return { record, sessionId };
}

function safeParse(text) {
  try { return JSON.parse(text); } catch (_) { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  // 저장소를 아직 연결하지 않았으면 프런트가 로컬 저장으로 조용히 넘어간다
  if (!isConfigured()) return json(res, 503, { error: 'not_configured' });

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  if (!body || typeof body !== 'object') return json(res, 400, { error: 'bad_request' });

  const { record, sessionId, error } = validate(body);
  if (error) return json(res, 400, { error });

  try {
    await command('HSET', HASH_KEY, sessionId, JSON.stringify(record));
    await pruneIfNeeded();
    return json(res, 200, { ok: true });
  } catch (err) {
    console.error('[submit]', err);
    return json(res, 500, { error: 'store_failed' });
  }
}
