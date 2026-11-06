# 이미지 정적 제공·자동화 구현 결과 — 2026-11-06

> 이 문서는 운영 배포 전 단계의 기록입니다. 이후 전체 Drive 체크섬 대조, 운영 배포 및
> 공개 이미지 검증을 완료했습니다. 최신 상태는 [연결 완료 기록](media-connection-2026-11-06.md)을 참고하세요.

## 상태

로컬 구현·전체 이미지1 변환·기능 검증 완료. **commit/push, 운영 배포, 예약 실행 활성화는 하지 않음.**
실제 GitHub CLI 인증과 PUBLIC 저장소를 확인했으나 Actions secrets/variables는 없었고,
Cloudflare Wrangler는 인증되지 않은 상태였다. Google 자동화용 서비스 계정도 제공되지 않았다.
최초 연결 순서는 [운영 안내](../docs/media-automation.md)에 기록했다.

## 처리 결과

| 구분 | 파일 수/자료 수 | 합계 바이트 | 원본 대비 감소 |
| --- | ---: | ---: | ---: |
| 보존한 이미지1 원본 | 2,324장 | 5,370,172,798 | — |
| 480px 카드용 | 2,324개 참조 | 117,522,592 | 97.81% |
| 960px 상세·확대용 | 2,324개 참조 | 366,698,710 | 93.17% |
| 두 크기 합계 | 4,648개 참조 | 484,221,302 | 90.98% |
| 내용 중복을 제거한 WebP | 4,640파일 | 483,742,068 | — |
| 전체 배포 산출물 | 4,697파일 | 491,025,699 | — |

카드 파일 평균 50,569바이트, 중앙값 50,292바이트. 확대 평균 157,788바이트.
품질 85, 비율 유지, 잘라내기·원본 확대 없음. 원본 디렉터리와 Downloads는 수정하지 않았다.
감소율은 **로컬 PNG 원본과 비교한 파일 크기**이며, 기존 Drive 썸네일 대비 전송량이나 실운영 속도 측정이 아니다.
변환 도구는 고정 버전 sharp 0.35.5/libvips 8.18.7이다.

## 구현

- Cloudflare의 동일 출처 `/media/종류/SHA256.webp` 정적 파일을 우선 사용.
- 카드 480px, 상세/확대 960px. 실패 시 기존 Drive 대체 경로 유지.
- SHA-256 내용 주소와 1년 immutable 캐시, JSON은 재검증.
- 기존 가상 목록·가시성·정지 160ms·동시 이미지 요청 2개 유지.
- 이미지1/이미지2/획순 독립 종류. 현재 활성화는 image1뿐.
- 이미지2는 리사이즈 후 무손실 WebP. 현재 스타일 전환 UI나 이미지2 전체 변환은 하지 않음.
- 획순 SVG는 원문 보존, 별도 img 표시. 실제 SMIL 애니메이션을 390/1280px에서 검증.
- Drive 읽기 전용 서비스 계정, 페이지 목록의 MD5 비교, 변경분만 원본 다운로드.
- 동일 ID 덮어쓰기 감지, 다운로드 중 변경/체크섬 불일치/필수 파일 누락 시 배포 중단.
- 캐시 소실 시 운영 최적화 파일 복원, 필요하면 원본 재생성.
- 매시 17/47분·수동·master push GitHub workflow. `MEDIA_SYNC_ENABLED=true`일 때만 동작.
- 검사 후에만 배포하고 JSON/카탈로그만 Git 기록. 바이너리는 Git에서 제외.
- 빌드 단계에서 실제 파일 개수 20,000 이하·각 파일 25 MiB 이하 및 필수 이미지 해시 검사.

## 원본 데이터

현재 Apps Script 응답은 한자 2,324개·독해 19개. 이미지2 필드가 이미 모두 채워져 있었다.
최신 응답에서 이미지2 URL 필드를 보존하도록 추가했고 芸의 풀이 1건을 반영했다.
한자 순서와 霧·六·勘 예시 교정 3건을 유지했다. 독해 JSON은 변경되지 않았다.
자동 교정은 현재 Google의 알려진 구버전 문구와 일치할 때만 적용하므로 이후 새 편집은 반영된다.
이번 원본 PNG와 Drive 전체 MD5 대조는 아직 수행하지 않았다. 최초 인증된 실행이 그 검증을 수행한다.

## 검증

- 단위 테스트 47개 통과: 데이터 보존, ID 기반 병합, 체크섬 변경·손상, 캐시 재사용,
  API 읽기 전용 scope·pagination·403/불완전 목록, SVG 보존·유해 요소 거부 등.
- 브라우저 회귀 테스트 51개 통과. Chrome, 모바일 크기 390px~데스크톱 1600px.
  빠른 목록 이동 중 미디어 요청 0건, 한자 데이터 요청 1건. DOM 카드 수 제한 유지.
- 애니메이션 검사에서 모바일 locator 캡처가 동일 프레임을 되풀이해 실제 viewport crop으로
  바꿔 검증했고, 모바일/데스크톱 모두 프레임 변화 확인.
- 실제 변환 파일 별도 브라우저 검사 1개 통과: 文 카드 naturalWidth 480,
  상세·확대 960, 같은 두 WebP만 요청. 이미지 응답을 mock하지 않았다.
  로컬 개발 서버 최종 측정은 카드 46,958바이트/2.6ms, 확대 179,458바이트/5.5ms였으며,
  이 수치는 Cloudflare 운영 성능이나 휴대폰 네트워크 성능을 의미하지 않는다.
- 재실행에서 변환 0, 재사용 2,324 확인.
- `npm run build`, YAML 구문 검사, `git diff --check` 통과.
- npm 설치 시 감사 및 런타임 의존성 감사에서 취약점 0건.

로컬 증거: `.local-assets/media-browser-tests.log`, `.local-assets/real-media-probe.json`,
`.local-assets/real-media-card-mobile.png`, `.local-assets/real-media-zoom-mobile.png`.
실기기 Safari, 실제 Cloudflare 캐시 헤더/속도, 인증된 원격 자동화 실행은 아직 미검증이다.

## 비용 기준

Cloudflare 정적 파일 요청은 무료·무제한이며 별도 저장 비용이 없다는 공식 문서를 확인했다.
현재 파일 수는 무료 버전당 20,000개 제한 안이다. 유료 Images/R2/동적 변환은 사용하지 않았다.
[Cloudflare 비용](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/),
[파일 한도](https://developers.cloudflare.com/workers/platform/limits/)

PUBLIC 저장소의 표준 Actions runner 무료 조건과 캐시 저장소당 10GB 범위를 기준으로 구성했다.
계정의 유료 캐시 확장 설정을 변경하지 않았다. 비공개 전환 시 요금 조건은 다시 검토해야 한다.
[GitHub 요금](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
