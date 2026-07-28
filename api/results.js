/**
 * /api/results — 관리자 전용.
 *
 *   GET                  저장된 응답 전체 (최신순)
 *   DELETE ?id=<세션>     한 건 삭제
 *   DELETE ?all=1        전체 삭제
 *
 * 인증은 x-admin-key 헤더. 값은 Vercel 환경변수 ADMIN_PASSWORD 와 비교한다.
 */
import {
  HASH_KEY, command, hasAdminPassword, isAdmin, isConfigured, json, readAll,
} from './_store.js';

export default async function handler(req, res) {
  if (!isConfigured()) {
    return json(res, 503, { error: 'not_configured', reason: 'storage' });
  }
  if (!hasAdminPassword()) {
    return json(res, 503, { error: 'not_configured', reason: 'password' });
  }
  if (!isAdmin(req)) {
    // 무차별 대입을 조금이라도 느리게 만든다. 서버리스라 시도 횟수를 셀 곳이 없다
    await new Promise((r) => setTimeout(r, 600));
    return json(res, 401, { error: 'unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      return json(res, 200, { records: await readAll() });
    }

    if (req.method === 'DELETE') {
      const { id, all } = req.query || {};
      if (all === '1') {
        await command('DEL', HASH_KEY);
        return json(res, 200, { ok: true, deleted: 'all' });
      }
      if (typeof id === 'string' && id) {
        await command('HDEL', HASH_KEY, id);
        return json(res, 200, { ok: true, deleted: id });
      }
      return json(res, 400, { error: 'bad_request' });
    }

    return json(res, 405, { error: 'method_not_allowed' });
  } catch (err) {
    console.error('[results]', err);
    return json(res, 500, { error: 'store_failed' });
  }
}
