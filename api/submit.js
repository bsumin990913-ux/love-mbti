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

const TESTS = { mbti: '성격 검사', love: '연애 유형 검사', ideal: '이상형 검사' };

const NAME_MAX = 20;
const ANSWERS_MAX = 100;

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

function validate(body) {
  const test = str(body.test);
  if (!TESTS[test]) return { error: '알 수 없는 검사예요' };

  const name = stripControl(str(body.name)).trim().slice(0, NAME_MAX);
  if (!name) return { error: '이름이 없어요' };

  const code = str(body.code);
  if (!/^[A-Z]{4}$/.test(code)) return { error: '유형 코드가 올바르지 않아요' };

  const answers = Array.isArray(body.answers) ? body.answers : null;
  if (!answers || !answers.length || answers.length > ANSWERS_MAX) {
    return { error: '응답 개수가 올바르지 않아요' };
  }
  if (!answers.every((a) => typeof a === 'string' && /^[A-Z]$/.test(a))) {
    return { error: '응답 값이 올바르지 않아요' };
  }

  const sessionId = str(body.sessionId).slice(0, 40);
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(sessionId)) return { error: '세션 값이 올바르지 않아요' };

  return {
    record: {
      test,
      testLabel: TESTS[test],
      name,
      code,
      nick: stripControl(str(body.nick)).slice(0, 40),
      answers,
      total: answers.length,
      createdAt: new Date().toISOString(),
    },
    sessionId,
  };
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
