# 마나보 검색 노출 설정

학습 페이지의 검색 제목과 설명은 `src/seo.js`에서 관리합니다. 빌드 시 생성되는 HTML과 브라우저에서 전환한 페이지가 같은 정보를 사용합니다.

- 도감: 일본어 한자, 그림으로 한자 외우기, 부수별·학년별·JLPT 한자 공부
- 독해: 일본어 한자 독해, 학년·JLPT별 읽기 연습
- 문제: 일본어 한자 테스트, 뜻과 음 복습

`/`는 별도 소개 홈이고 `/kanji/`는 한자 목록입니다. 도감의 canonical은 `https://kanjimanabo.com/kanji/`이며, 필터 쿼리가 붙은 도감도 이 대표 주소를 사용합니다. 홈·독해·문제·안내 페이지는 각자의 대표 주소를 사용합니다. 학습 HTML 원본은 `src/study.html`이고 `scripts/study-pages.mjs`가 세 학습 페이지를 생성합니다.

`public/robots.txt`는 크롤링을 허용하고 사이트맵을 안내합니다. `public/sitemap.xml`에는 `/`, `/kanji/`, `/reading/`, `/quiz/`, `/about/`, `/privacy-policy/`, `/copyright/`, `/contact/`의 대표 주소 8개가 있습니다. 루트 HTML에는 WebSite 구조화 데이터가 있습니다. `npm run build`는 `dist/`를 생성하며 `npm run preview`로 로컬 산출물을 확인합니다.

## 배포 후 할 일

1. Google Search Console에서 `kanjimanabo.com` 도메인 속성을 등록하고 DNS로 소유권을 확인합니다.
2. 사이트맵 메뉴에서 `https://kanjimanabo.com/sitemap.xml`을 제출합니다.
3. 홈·독해·문제의 URL 검사에서 실제 URL 테스트를 실행하고 렌더링된 본문을 확인합니다. 필요하면 색인 생성을 요청합니다.

Search Console 등록 및 제출은 이번 코드 변경에 포함되지 않습니다. 설정은 검색 노출과 순위를 보장하지 않습니다. 개별 한자와 독해 글은 아직 독립 URL이 없으며, 본문은 JavaScript로 불러옵니다. 개별 콘텐츠 검색 유입을 넓히려면 고유 URL과 빌드 시 본문 HTML을 제공하는 작업이 필요합니다.

공식 참고: https://developers.google.com/search/docs/fundamentals/get-started-developers
