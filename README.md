# 마나보 (Manabo)

그림과 암기 풀이로 일본어 한자를 공부하는 Vite·JavaScript 정적 사이트입니다.
한자 도감의 검색·학년/JLPT 필터, 한자 독해와 본문 속 한자 정보,
4지선다 문제 및 오답 복습을 제공합니다.

## 개발과 검증

이번 로컬 검증 환경은 Node.js **26.9.0**, npm **11.19.1**입니다.
CI는 Node.js 24와 Playwright Chromium을 사용하도록 구성했습니다.
Vite가 지원하는 Node.js 버전이 필요하며, 개발용 Node/npm과 브라우저 설치에 인터넷 연결이 필요합니다.

```sh
npm ci
npm run dev
npm run build
npm run preview
```

개발 서버는 Vite가 출력한 로컬 주소로 접속합니다. `build`는 `dist/`에 배포용 파일을 만들고,
`preview`는 그 산출물을 로컬에서 확인합니다. 이 명령들은 운영 배포를 실행하지 않습니다.

```sh
npx playwright install chromium
npm run test:unit
npm run test:browser
npm test
```

브라우저 테스트는 포트 **4173**에 별도 Vite 서버를 띄우므로 해당 포트가 비어 있어야 합니다.
운영 Sheets를 호출하지 않으며, JSON 응답·외부 이미지·폰트·분석 요청을 mock 처리합니다.
실제 Chromium에서 Tab·Shift+Tab·Escape, 브라우저 탐색, 로딩 실패와 복구를 검증합니다.
실패 시 `test-results/`에 스크린샷과 trace를 남깁니다.

## 데이터 동기화

브라우저는 `public/data/kanji.json`과 `public/data/stories.json`만 읽습니다.
한자·퀴즈는 한자 JSON만 요청하고, 독해는 독해 JSON 및 한자 링크에 필요한 한자 인덱스를 준비합니다.
실패한 데이터는 활성 화면의 **다시 시도** 버튼으로 다시 요청할 수 있습니다.

운영자가 데이터를 갱신할 때만 다음 명령을 사용합니다.

1. `.env.example`을 참고해 `.env.local`에 실제 `MANABO_SHEETS_API_URL`을 설정합니다.
2. Sheets 원본과 응답을 검토한 뒤 `npm run sync-data`를 실행합니다.
3. 두 JSON의 diff와 테스트·빌드를 검토합니다. 파일 변경만으로 배포되지는 않습니다.

스크립트는 필수 필드·타입·읽기/예시 형식·이미지 URL·중복 번호·읽기 ID 보존을 검사합니다.
한자는 기존 최소 2,000개 및 직전 파일의 90% 이상 유지 정책을 적용합니다.
읽기는 기본적으로 기존 ID 삭제를 허용하지 않으며, 동일 개수의 ID 교체도 차단합니다.
기존 파일이 없으면 최초 생성으로 검증하고, 존재하는 파일의 JSON 또는 스키마가 손상되면 중단합니다.
두 응답이 모두 유효할 때만 임시 파일·백업을 거쳐 교체하며, 쓰기 실패 시 두 파일을 복원합니다.
복원 자체가 실패하면 백업을 남기고 수동 복원이 필요하다고 알립니다.

의도적인 읽기 삭제는 삭제할 기존 ID를 하나씩 확인합니다. 새 데이터 스키마 검증은 계속 적용됩니다.

```sh
npm run sync-data -- --allow-story-removal=story-ID
# 여러 ID는 --allow-story-removal=다른-ID를 반복 지정
```

실제 삭제되는 ID와 일치하지 않는 옵션은 거부합니다. 모든 검증을 끄는 `--force`는 없습니다.
자세한 예외와 보존 조건은 [동기화 검증 문서](reports/sync-data-validation.md)를 참고하세요.

`.env.local`은 Git에서 제외됩니다. API 주소·비밀 값은 테스트/문서에 복사하지 마세요.
`VITE_CONTACT_EMAIL`은 사이트에 공개되는 연락처 재정의용이며 비밀 값을 넣으면 안 됩니다.

## 파일과 공개 경로

| 파일 | 역할 |
| --- | --- |
| `index.html`, `src/home.js`, `src/home.css` | 별도 홈 `/` |
| `src/study.html` | 학습 HTML 원본 |
| `scripts/study-pages.mjs` | `/kanji/`, `/reading/`, `/quiz/` HTML 생성 |
| `src/main.js`, `src/styles.css` | 학습 로직과 스타일 |
| `src/seo.js` | 학습 페이지별 제목·설명·canonical |
| `public/data/*.json` | Sheets에서 동기화한 공개 학습 데이터 |
| `scripts/sync-sheets.mjs` | 운영자용 데이터 검증·저장 |
| `scripts/sync-sheets.test.mjs` | 임시 파일/응답을 사용한 동기화 회귀 테스트 |
| `tests/browser/`, `playwright.config.js` | 브라우저 회귀 테스트 |
| `.github/workflows/ci.yml` | 설치·테스트·빌드 CI |
| `vite.config.js`, `wrangler.jsonc` | 다중 페이지 빌드·`dist` 산출물 설정 |

생성된 `kanji/index.html`, `reading/index.html`, `quiz/index.html`을 직접 고치지 마세요.
현재 사이트맵은 `/`, `/kanji/`, `/reading/`, `/quiz/`, `/about/`,
`/privacy-policy/`, `/copyright/`, `/contact/`의 8개 경로입니다.
도감의 canonical은 `/kanji/`입니다.

## 원본 데이터 후속 작업

이번 로컬 교정은 **霧·六·勘의 예시단어 3건**입니다.
다음 동기화에서 덮어써지지 않도록 Google Sheets 원본에도 동일한 교정을 별도로 반영해야 합니다.
이번 작업에서는 운영 Sheet를 수정하거나 운영 동기화를 실행하지 않았습니다.

중학 2 읽기의 如·嫁·慌 및 고교 2 읽기의 采 누락은 별도 콘텐츠 검토 사항입니다.
전체 한자를 포함해야 하는 기획이 확인되지 않아 문장을 추가하지 않았습니다.
개별 콘텐츠 SEO 구조 개편·이미지 호스팅 이전·미등록 구성 요소 추가는 이번 범위에 포함하지 않습니다.
이 문서는 실제 운영 배포·검색 색인·광고 승인 또는 외부 이미지 가용성을 보증하지 않습니다.
