# Manabo 수정 명세 검증 결과

대상 명세: `prompt/Manabo_Codex_Fix_Spec.md`.
기준 및 작업 시작 HEAD: `3f5b575a40530fa6c6854fd4d8fe2ea9d7cdfdb2`, 브랜치 `master`.
로컬 최종 검증일: 2026-10-20.
사용자가 작성한 미커밋 명세 파일을 보존했습니다. 커밋·push·PR·배포는 수행하지 않았습니다.

## 명세별 결과

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| 2-1 한자 필드 | 완료 | 발음·예시단어·획순 이미지의 키/문자열 타입/형식/URL 검사. 참고의 빈 예시, `無し` 및 壴의 빈 발음만 필드별 허용 |
| 2-2 개수·번호 | 완료 / 기존 보호 유지 | 최소 2,000개·직전 90% 유지. 암기순·문부성 중복 차단. 현재 전체 수를 고정하지 않음 |
| 2-3 읽기 삭제 | 완료 | 직전 정상 ID와 비교해 감소/동일 개수 ID 교체 거부. 실제 삭제 ID별 명시적 확인 옵션 |
| 2-4 읽기 스키마 | 완료 | 문자열 타입, 학년별/JLPT 분류·등급, ID 공백/중복, 버전·본문 검사 |
| 2-5 저장 일관성 | 완료 | 양쪽 검증 후 저장. 두 번째 rename 실패 시 두 파일 바이트 복원, 최초 생성의 부분 파일 제거 테스트 |
| 3 로딩·복구 | 완료 | 한자/읽기 요청 분리, 진행 요청 공유 및 실패 후 재요청. 활성 화면 오류/재시도. 읽기·퀴즈 첫 진입에서 숨겨진 목록 카드 0개 |
| 4 URL·필터 | 완료 | grade/jlpt 직접 변경·상세 링크·초기화·뒤로/앞으로 동기화. 앱 소유 조건만 정리. 빈 결과의 활성 획수/음 선택 유지 |
| 5 모달·팝오버 | 완료 | 실제 키보드 순환·배경 inert·opener 복원/대체·빈 focus 목록·늦게 추가된 배경 컨트롤. 팝오버 우선 Escape 및 부모/이미지/히스토리 정리 |
| 6 퀴즈 | 완료 | 시작 전 이전 상태 제거. 후보 부족은 설정 화면 오류. 후보 4개에서도 요청 10개를 4개로 조정하고 정상 진행 |
| 7 해시·중복 | 완료 | 잘못된 URI 디코딩을 로딩 오류와 분리. 직접 진입·같은 문서 해시·중복 탐색 이벤트·반복 재시도/초기화 검증 |
| 8 데이터 3건 | 완료 | 霧·六·勘의 예시단어만 교정. 그 외 필드·행 순서/수 및 stories 원본 바이트 불변 확인 |
| 9 의존성 | 완료 | source-map-js 1.2.1→1.2.2, Playwright 테스트 의존성 외 기존 패키지 버전 보존. npm ci 및 audit 0건 |
| 10 문서 | 완료 | README 신설, 홈/학습 원본/canonical/사이트맵 8경로/동기화와 원본 교정 절차 반영 |
| 11 테스트·CI | 로컬 완료 / 원격 CI 미실행 | 기존 Node 테스트 유지·확장. Playwright Chromium 21개. GitHub Actions 구성 추가. push하지 않아 원격 실행 결과는 없음 |

이전 카드 키보드 충돌은 기준 HEAD에서 이미 별도 네이티브 뒤집기 버튼과 내부 상세 버튼으로
해결되어 있었습니다. 이를 다시 재구성하지 않았으며, 실제 Enter·Space·Tab 동작 검증을 유지했습니다.
상세 이미지에도 기존 이미지 모달을 여는 별도 버튼을 두어 중첩 모달의 포커스 복원을 검증합니다.

## 변경 파일

| 파일 | 목적 |
| --- | --- |
| `scripts/sync-sheets.mjs` | 스키마·ID·번호 검증, 기존 파일 검증, 명시적 읽기 삭제, rollback 보강 |
| `scripts/sync-sheets.test.mjs` | 동기화·파일 보존·실패 주입 회귀 테스트 26개 |
| `src/main.js` | 페이지 의존성·복구, URL/해시 상태, 모달 포커스, 퀴즈 초기화 |
| `src/study.html`, `src/styles.css` | 공통 상태·재시도, 퀴즈 설정 오류, 모달 포커스 및 이미지 버튼 |
| `public/data/kanji.json` | 지정된 예시단어 3건만 수정 |
| `tests/browser/study.spec.js`, `playwright.config.js` | 독립적인 API/이미지 mock과 실제 Chromium 회귀 테스트 |
| `package.json`, `package-lock.json` | 테스트 명령, Playwright 개발 의존성, 보안 패치 잠금 |
| `.gitignore` | Playwright 결과물 제외 |
| `.github/workflows/ci.yml` | Node 24, npm ci, Chromium 설치, 전체 테스트·빌드 |
| `README.md`, `reports/sync-data-validation.md` | 개발·데이터 운영·삭제 확인·원본 교정 절차 |
| `reports/adsense-preparation.md`, `reports/search-setup.md` | 현재 로컬 홈·도감·원본·경로 구조 정정 |

## 실행 결과

검증 환경: Node.js v26.9.0, npm 11.19.1, Playwright 1.64.1 Chromium.

| 명령/검증 | 결과 |
| --- | --- |
| `npm ci` | 성공, 잠금 파일로 깨끗한 설치 |
| `npx playwright install chromium` | 공식 관리 브라우저 설치 성공 |
| `npm test` | Node 동기화 26개 + Chromium 브라우저 21개 모두 통과 |
| `npm run build` | 성공, `dist/` 생성 |
| 사이트맵→dist 검사 | 상위 경로 8개 모두 index.html 존재, 3개 학습 canonical 및 재시도 UI 확인 |
| `npm audit --json` | vulnerabilities 0건 |
| `git diff --check` | 통과 |
| HEAD와 데이터 의미 비교 | 변경은 六·勘·霧의 예시단어 3필드뿐. stories 바이트 동일 |

실제 브라우저 시나리오는 읽기 503 중 한자/퀴즈 정상 사용, 읽기·한자 실패 후 반복 재요청,
URL 초기화와 새로고침/뒤로/앞으로, 결과 0개의 활성 인덱스 해제, 올바르거나 손상된 해시,
Tab·Shift+Tab·Escape와 중첩 모달 닫기, opener 제거, 퀴즈 완료 후 후보 부족과 복구를 포함합니다.
처음 브라우저 검증에서 발견한 중복 hashchange/popstate에 의한 재초기화 경합도 수정했습니다.

## 제한과 후속 작업

- 운영 Google Sheets 원본을 수정하지 않았고 운영 동기화를 실행하지 않았습니다.
- 霧의 훈독 중복 제거, 六의 음독 표식/중복 정리, 勘弁 표기 교정은 원본 Sheet에도 별도 반영해야 합니다.
  반영 전에는 다음 동기화가 로컬 교정을 덮어쓸 수 있습니다.
- 중학 2 읽기의 如·嫁·慌, 고교 2 읽기의 采는 콘텐츠 기획 검토 과제로 남겼습니다. 문장이나 부수 데이터를 추가하지 않았습니다.
- 외부 이미지·폰트·분석 서비스는 테스트에서 mock 처리했습니다. 실제 원격 이미지의 가용성이나 운영 배포·검색 색인·AdSense 승인 상태를 검증한 결과가 아닙니다.
- Chromium에서 검증했으며 Safari/Firefox 및 원격 GitHub Actions 실행은 하지 않았습니다.
- 두 JSON 저장은 예외 발생 시 rollback하는 방식입니다. 프로세스 강제 종료·전원 차단까지 두 파일을 원자적으로 묶는 저장소 트랜잭션은 아닙니다.
- [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)는 Vite→PostCSS→source-map-js 개발/빌드 도구 경로의 source map 처리 취약점입니다.
  운영 사이트 방문자를 대상으로 한 공격이 입증됐다는 의미로 확대하지 않았습니다.
- SEO 구조 개편·개별 콘텐츠 정적 URL·이미지 호스팅 이전은 이번 작업에서 제외했습니다.
