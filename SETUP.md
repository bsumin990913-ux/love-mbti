# 응답 저장소 연결하기

검사 결과를 서버에 모아서 `/admin.html` 에서 보려면 한 번만 설정하면 된다.
설정 전에는 사이트가 그대로 동작하고, 기록은 검사한 사람의 브라우저에만 남는다.

## 1. Upstash Redis 만들기

Vercel 대시보드 → 프로젝트 → **Storage** → **Create Database** →
**Marketplace Database Providers** 에서 **Upstash for Redis** 선택 → 무료(Free) 플랜.

프로젝트에 연결(Connect)하면 아래 두 값이 환경변수로 자동으로 들어온다.

| 이름 | 설명 |
| --- | --- |
| `KV_REST_API_URL` | Upstash REST 엔드포인트 |
| `KV_REST_API_TOKEN` | 접근 토큰 |

> Upstash 사이트에서 직접 만들었다면 이름이 `UPSTASH_REDIS_REST_URL` /
> `UPSTASH_REDIS_REST_TOKEN` 인데, 둘 다 인식한다.

## 2. 관리자 비밀번호 넣기

**Settings → Environment Variables** 에서 직접 추가한다.

| 이름 | 값 |
| --- | --- |
| `ADMIN_PASSWORD` | 길고 추측하기 어려운 문자열 |

이 값이 없으면 `/admin.html` 은 아무도 들여보내지 않는다.
환경변수를 깜빡한 사이에 응답이 공개되는 쪽이 훨씬 나쁘기 때문이다.

## 3. 다시 배포

환경변수는 배포 시점에 주입되므로 **Deployments → Redeploy** 를 한 번 눌러야 적용된다.

---

## 무료 한도

| | 한도 | 검사 1건 |
| --- | --- | --- |
| Upstash Redis | 256MB · 월 50만 명령 | 약 200바이트 · 명령 2회 |
| Vercel Functions | 월 100만 호출 | 1회 |

검사 1만 건이 2MB 남짓이라 사실상 걸릴 일이 없다.
그래도 무한정 쌓이지 않도록 `api/_store.js` 의 `MAX_RECORDS`(기본 5000건)를 넘으면
오래된 기록부터 지운다.

## 저장되는 것

```json
{
  "test": "mbti",
  "name": "홍길동",
  "code": "ISTJ",
  "nick": "약속을 지키는 사람",
  "answers": ["I", "I", "E", "..."],
  "createdAt": "2026-07-28T00:31:00.000Z"
}
```

문항 본문은 저장하지 않는다. 고른 극(pole)만 남기고 관리자 페이지가
`questions.js` / `love-questions.js` 와 인덱스로 맞춰 되살린다.
그래서 문항 카피를 고치면 지난 기록의 표시도 같이 따라온다.
대신 **문항 수나 순서를 바꾸면 그 이전 기록은 문항과 어긋난다** —
개수가 다르면 관리자 페이지가 본문 대신 고른 값만 보여준다.

### 관계 반응 검사(`sai`)는 모양이 다르다

`/sai.html` 은 홈에 링크하지 않은 별도 페이지다. 문항 타입이 섞여 있어서
답도 배열이 아니라 **문항 번호를 키로 하는 객체**로 저장한다.

```json
{
  "test": "sai",
  "name": "달순",
  "code": "ENFP",
  "nick": "안정 애착 경향",
  "scores": { "anxiety": 49, "avoidance": 31 },
  "answers": {
    "0": ["review", "ask"],
    "1": ["ask", "review"],
    "2": "clear",
    "3": "응 알겠어. 무슨 일 있는 건 아니지?",
    "4": 22
  },
  "createdAt": "2026-08-13T07:55:00.000Z"
}
```

배열이 아닌 이유는 2번 문항(순서 정렬)이 조건부이기 때문이다. 1번에서 하나만
고르면 정렬할 게 없어 건너뛰는데, 배열이면 그 뒤가 한 칸씩 밀려 문항과 어긋난다.
그래서 **완료 응답은 35개일 때도 34개일 때도 있다.**

4번 문항의 자유 서술은 사용자가 쓴 문장 그대로 저장된다(200자에서 자르고
줄바꿈은 공백으로 접는다). 이 검사만 `anxiety` / `avoidance` 점수를 함께 남긴다.

## 알아둘 점

- `/api/submit` 은 누구나 호출할 수 있다. 값 검증과 건수 상한은 걸어뒀지만,
  누가 작정하고 가짜 기록을 넣는 걸 막지는 않는다.
- 비밀번호 시도 횟수를 제한하지 않는다(서버리스라 셀 곳이 없다). 대신 실패 응답을
  0.6초 늦춘다. 비밀번호를 길게 쓰는 게 실질적인 방어다.
- `admin.html` 은 `robots.txt` 와 `noindex` 로 검색에서 빼뒀다.

## 로컬에서 API까지 돌려보기

`npx serve` 는 정적 파일만 준다. 함수까지 돌리려면:

```bash
npx vercel dev
```

환경변수는 `vercel env pull` 로 `.env.local` 에 받아온다.
