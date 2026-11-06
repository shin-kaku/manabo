# 마나보 (Manabo)

그림과 암기 풀이로 일본어 한자를 공부하는 Vite·JavaScript 정적 사이트입니다.
한자 도감의 검색·학년/JLPT 필터, 한자 독해와 본문 속 한자 정보,
4지선다 문제 및 오답 복습을 제공합니다.

오른쪽 위 **사이트 안내** 메뉴의 첫 버튼에서 화이트·다크모드를 전환합니다.
기본값은 화이트모드이며, 선택은 해당 브라우저에 저장되어 페이지 이동·새로고침 후에도 유지됩니다.
`src/theme-init.js`는 Vite가 모든 HTML의 스타일보다 먼저 삽입해 저장된 테마를 바로 적용하고,
`src/theme.js`는 버튼 문구와 다른 탭의 테마를 함께 갱신합니다. 그림과 획순 원본 색상은 유지합니다.

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

브라우저는 `public/data/kanji.json`, `public/data/stories.json`과 최적화 이미지 카탈로그 `media.json`을 읽습니다.
한자·퀴즈는 독해 JSON을 요청하지 않으며, 독해는 독해 JSON 및 한자 링크에 필요한 한자 인덱스를 준비합니다.
실패한 데이터는 활성 화면의 **다시 시도** 버튼으로 다시 요청할 수 있습니다.

Google 변경분은 활성화된 자동화가 매일 오전 8시 17분(일본 시간)에 한 번 확인합니다.
수동으로 데이터를 검토·갱신할 때는 다음 명령을 사용합니다.

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

이미지1은 480/960px WebP를 Cloudflare 정적 파일로 제공하도록 구성했습니다.
Google JSON·Drive 체크섬 비교 → 변경분 변환 → 검증 → 배포 자동화와
이미지2·애니메이션 획순 SVG 확장 방법은 [이미지 자동화 안내](docs/media-automation.md)를 참고하세요.
2026-11-06 운영 배포와 인증 연결을 완료하고 예약 자동화를 활성화했습니다.
[실제 배포·증분 동기화 검증 결과](reports/media-connection-2026-11-06.md)를 참고하세요.

| 파일 | 역할 |
| --- | --- |
| `index.html`, `src/home.js`, `src/home.css` | 별도 홈 `/` |
| `src/study.html` | 학습 HTML 원본 |
| `scripts/study-pages.mjs` | `/kanji/`, `/reading/`, `/quiz/` HTML 생성 |
| `src/materials.html`, `scripts/material-pages.mjs` | 학습 자료 모음과 학년별 한자·독해 본문 HTML 생성 |
| `src/main.js`, `src/styles.css` | 학습 로직과 스타일 |
| `src/virtual-grid.js` | CSS 열 수에 맞춘 가상 목록·화면 회전 시 위치 유지·키보드 이동 |
| `src/card-images.js` | 카드 이미지 요청 지연·동시 요청 제한·최근 이미지 재사용 |
| `src/example-ruby.js` | 상세 예시 단어의 한자별 루비 대응 및 단어 전체 표시 대체 처리 |
| `src/seo.js` | 학습 페이지별 제목·설명·canonical |
| `public/data/*.json` | Sheets에서 동기화한 공개 학습 데이터 |
| `scripts/sync-sheets.mjs` | 운영자용 데이터 검증·저장 |
| `scripts/sync-sheets.test.mjs` | 임시 파일/응답을 사용한 동기화 회귀 테스트 |
| `tests/browser/`, `playwright.config.js` | 브라우저 회귀 테스트 |
| `.github/workflows/ci.yml` | 설치·테스트·빌드 CI |
| `vite.config.js`, `wrangler.jsonc` | 다중 페이지 빌드·`dist` 산출물 설정 |

생성된 `kanji/index.html`, `reading/index.html`, `quiz/index.html`을 직접 고치지 마세요.
기본 사이트맵은 `/`, `/kanji/`, `/reading/`, `/quiz/`, `/about/`,
`/privacy-policy/`, `/copyright/`, `/contact/`의 8개 경로입니다.
빌드 시 `public/data`의 기존 자료로 `/materials/`, 학년별 한자 11개,
독해 본문 19개를 생성하고 `dist/sitemap.xml`에 포함합니다. 현재 총 39개 경로입니다.
`materials/`의 생성 HTML을 직접 편집하지 마세요. 공통 틀은 `src/materials.html`,
본문·목록 생성은 `scripts/material-pages.mjs`, 학습 내용은 기존 JSON이 원본입니다.
개발 중에는 자료 틀과 JSON 변경을 감지해 재생성하며, 정식 빌드는 항상 최신 JSON으로 생성합니다.
정적 독해 본문에서 `/reading/?story=story-ID`로 해당 대화형 독해를 열 수 있습니다.
도감의 canonical은 `/kanji/`입니다.

도감은 전체 목록의 스크롤 높이를 유지하면서 화면 주변 3개 행까지만 카드를 만듭니다.
CSS의 2~6열 반응형 설정으로 카드 크기를 계산하고, 화면 밖 카드는 DOM에서 제거합니다.
키보드로 포커스한 카드 1개는 유지하며, 상세보기 동안 목록을 고정해 복귀 위치를 보존합니다.
카드 뒤집기 상태는 한자별로 보관합니다. 목록 이미지는 뒤집힌 카드가 실제 화면에 보이고
스크롤이 160ms 이상 멈췄을 때 요청하며, 정지 상태에서 직접 뒤집으면 바로 요청합니다.
목록 이미지 요청은 동시 2개, 제거된 카드의 완료 이미지 캐시는 최근 4개로 제한합니다.
빠른 스크롤 중 대기 요청을 비우고 화면 밖 미완료 이미지의 `src`를 해제합니다.
이미 서버에 전송된 요청의 네트워크 취소 시점은 브라우저가 결정합니다.
상세보기·확대 이미지의 기존 요청 및 대체 URL 동작은 별도입니다.
자료/이미지를 스크롤마다 다시 가져오는 API 요청은 추가하지 않았습니다.

상세보기의 예시 단어는 기존 `단어(읽기) 뜻` 데이터를 루비로 표시합니다.
`src/example-ruby.js`는 한자의 `발음`과 단어 전체 읽기를 대조하고, 오쿠리가나와 복합어의
일부 음변화를 처리해 대응 후보가 하나일 때 한자별로 나눕니다. 후보가 없거나 여러 개면
단어 전체에 읽기를 붙입니다. 이는 자동 대응이며 모든 단어의 언어적 정확성을 보증하는
검수는 아닙니다. 원본 데이터 형식은 유지하며, 루비 색은 `--accent`를 따릅니다.

## 원본 데이터 후속 작업

**霧·六·勘의 예시단어와 食의 삭제된 이미지 링크**는 알려진 이전 원본 값에만
`scripts/data-corrections.json`의 교정을 적용합니다. Google에서 새 값으로 수정하면 새 값을 유지합니다.
운영 Sheet 자체는 수정하지 않았으며, Google JSON·Drive 읽기 및 운영 배포를 검증했습니다.

중학 2 읽기의 如·嫁·慌 및 고교 2 읽기의 采 누락은 별도 콘텐츠 검토 사항입니다.
전체 한자를 포함해야 하는 기획이 확인되지 않아 문장을 추가하지 않았습니다.
학습 자료 HTML 공개 구조는 [애드센스 대응 기록](reports/adsense-response-2026-10-21.md)에 설명했습니다.
이미지 제공 구조의 변경 및 운영 연결 상태는 [이미지 자동화 안내](docs/media-automation.md)에 기록했습니다.
운영 배포 확인 범위는 위 검증 기록에 명시했습니다. 검색 색인·광고 승인 검증은 별도입니다.
