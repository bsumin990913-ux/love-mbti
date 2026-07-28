/**
 * Upstash Redis REST 클라이언트 + 응답 저장소.
 *
 * 이 저장소는 npm 의존성이 하나도 없다(빌드 단계도 없다). 그 성질을 지키려고
 * SDK 대신 Upstash 의 HTTP API 를 fetch 로 직접 부른다.
 *
 * 필요한 환경변수 (Vercel → Settings → Environment Variables):
 *   KV_REST_API_URL   또는 UPSTASH_REDIS_REST_URL    — Vercel 마켓플레이스 연동 시 자동 주입
 *   KV_REST_API_TOKEN 또는 UPSTASH_REDIS_REST_TOKEN
 *   ADMIN_PASSWORD    — 관리자 페이지 비밀번호
 */
import { createHash, timingSafeEqual } from 'node:crypto';

const REST_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL   || '';
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

/** 응답을 담는 해시. field = sessionId, value = JSON 문자열 */
export const HASH_KEY = 'quiz:submissions:v1';
/** 보관 상한. 넘으면 오래된 것부터 지운다 */
export const MAX_RECORDS = 5000;

export const isConfigured = () => Boolean(REST_URL && REST_TOKEN);

/** Redis 명령 하나를 실행한다. 예) command('HSET', key, field, value) */
export async function command(...args) {
  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args.map(String)),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(`Upstash ${args[0]} 실패: ${data.error || res.status}`);
  }
  return data.result;
}

/**
 * 저장된 응답 전체를 최신순으로 돌려준다.
 * HGETALL 은 [field, value, field, value, ...] 평평한 배열로 온다.
 */
export async function readAll() {
  const flat = await command('HGETALL', HASH_KEY);
  if (!Array.isArray(flat)) return [];

  const records = [];
  for (let i = 0; i < flat.length; i += 2) {
    try {
      const record = JSON.parse(flat[i + 1]);
      record.sessionId = flat[i];
      records.push(record);
    } catch (_) {
      // 깨진 값 하나 때문에 목록 전체가 막히면 안 된다
    }
  }
  records.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return records;
}

/** 상한을 넘으면 오래된 응답부터 지운다 */
export async function pruneIfNeeded() {
  const size = Number(await command('HLEN', HASH_KEY)) || 0;
  if (size <= MAX_RECORDS) return;

  const records = await readAll();          // 최신순
  const doomed = records.slice(MAX_RECORDS); // 상한 밖 = 오래된 쪽
  if (doomed.length) {
    await command('HDEL', HASH_KEY, ...doomed.map((r) => r.sessionId));
  }
}

/* ── 관리자 인증 ──────────────────────────────────── */

/**
 * 비밀번호 비교. 먼저 SHA-256 으로 접어서 길이를 32바이트로 고정한 뒤
 * timingSafeEqual 로 비교한다 — 길이나 비교 시간으로 정답을 흘리지 않는다.
 */
function safeEqual(a, b) {
  const digest = (v) => createHash('sha256').update(String(v), 'utf8').digest();
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * 관리자 요청인지 확인한다.
 * 비밀번호가 설정돼 있지 않으면 아무도 통과시키지 않는다 —
 * 환경변수를 깜빡한 사이에 응답이 전부 공개되는 쪽이 훨씬 나쁘다.
 */
export function isAdmin(req) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) return false;
  const given = req.headers['x-admin-key'] || '';
  return Boolean(given) && safeEqual(given, expected);
}

export const hasAdminPassword = () => Boolean(process.env.ADMIN_PASSWORD);

/* ── 응답 헬퍼 ────────────────────────────────────── */

export function json(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(JSON.stringify(body));
}
