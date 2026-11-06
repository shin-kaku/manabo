# 미디어 자동화 연결 완료

## 확인 완료

- PUBLIC GitHub 저장소 `shin-kaku/manabo`, 4개 필수 Secrets 등록과 이름 readback 완료. 값은 출력하지 않음.
- Cloudflare 기존 `manabo` Worker와 `kanjimanabo.com` 유지. 중복 Git 자동 빌드 비활성화 저장 확인.
- 배포 토큰: 기존 계정 Workers Scripts Edit + Account Settings Read, 만료 2027-11-06.
- Google Cloud 프로젝트 `manabo-media-sync-20261106`, Drive API 활성화. 결제/유료 리소스 추가 없음.
- 전용 서비스 계정은 프로젝트 IAM 역할 없음. `Kanji_1_TCG`에 Viewer 권한만 추가하고 metadata로 readback 확인.
- `MEDIA_SYNC_ENABLED=true` 설정.
- 전체 2,324개 원본 MD5 일치. 실제 Google API 증분 동기화: changed 0, reused 2324, skipped 0.
- 食의 이전 Drive ID는 소유자 인증으로도 404. 같은 폴더의 `kanji_165_食.png`를 파일명·크기·MD5로 확인해 교정.
  정확히 기존 잘못된 URL일 때만 교정하므로 향후 Google의 새 링크 수정은 그대로 반영됨.
- GitHub 캐시 현재 17,309,321 bytes. 유료 확장을 활성화하지 않음.

## 운영 검증

- 첫 실행 `42090621423`: Google JSON 동기화, 이미지 2,324개 준비, 단위 테스트 47개 성공.
- 브라우저 51개 중 47개 성공. 4개는 기존 macOS 전용 `/private/tmp` 스크린샷 경로 때문에 Linux에서 ENOENT로 실패.
  Playwright `testInfo.outputPath`로 수정. 이미지 변환 성공 후 검증된 캐시를 먼저 저장하도록 작업 순서도 수정.
- 운영 배포는 테스트 실패 시 실행되지 않음. 수정 후 전체 검사 및 공개 이미지 확인 완료.

## 최종 운영 결과

- [배포 실행 42093827828](https://github.com/shin-kaku/manabo/actions/runs/42093827828): 성공.
  단위 테스트 47개, 브라우저 테스트 51개 통과. Cloudflare 버전 `7423cb71-01d6-465f-ae3d-2dcf5860b3d9`.
- 운영: https://kanjimanabo.com/kanji/ — 이미지1 2,324개, 고유 WebP 4,640개.
  배포 전체 4,696파일 / 491,019,637 bytes. 무료 20,000파일 한도 안에서 검사 통과.
- 카드 변환본 합계 117,522,592 bytes: 원본 5,370,172,798 bytes 대비 약 97.8% 감소.
  상세 합계 366,698,796 bytes. Linux 변환에서 상세 1건의 바이트 차이를 운영 카탈로그에 반영했고,
  배포 카탈로그와 Git 카탈로그가 일치함을 확인함.
- [후속 실행 42094663587](https://github.com/shin-kaku/manabo/actions/runs/42094663587): 35초 만에 성공.
  실제 Google 조회 결과 `changed=0, reused=2324, skipped=0`. 원본 다운로드 및 재배포 없음.
- PUBLIC/master 및 workflow `active` 확인. 매시 17분/47분 예약 설정.
  이번 실행 검증은 push 및 수동 재실행 기준이며, 예약 실행 시각은 GitHub의 스케줄러 지연 영향을 받음.

## 공개 사이트 브라우저 확인

별도 Chromium 세션에서 운영 URL을 직접 열어 390px / 1280px 두 검사를 통과함.
40회 빠른 스크롤 후 화면에 남은 카드 수는 각각 22개 / 50개. 뒤집지 않은 카드의 이미지 요청 0건.
文 카드 480px, 상세 및 확대 960px 디코딩 확인. 확대는 상세 파일 재사용으로 총 이미지1 요청 2건.
두 응답 모두 HTTP 200 및 immutable 캐시 헤더 확인. 페이지 JavaScript 오류 없음.
실제 모바일 폭 확대 화면을 열어 이미지가 정상 표시되는 것도 확인함.

| 화면 폭 | 카드 파일 | 상세 파일 | 카드 다운로드 | 상세 다운로드 |
| --- | ---: | ---: | ---: | ---: |
| 390px | 46,958 B | 179,458 B | 248ms | 297ms |
| 1280px | 46,958 B | 179,458 B | 36ms | 40ms |

위 시간은 이 검증 환경의 단일 측정값이며 모든 사용자·실기기·회선의 보장값은 아님.
실기기 Safari의 장시간 사용 검증은 별도이며, 자동 검사는 Chromium의 반응형 화면 기준.
이미지2/애니메이션 SVG는 확장 구조와 테스트를 준비했으며 현재 운영 최적화 대상은 이미지1.

## 비용 및 운영

이번 연결에서 유료 플랜, R2, Cloudflare Images, 결제 계정, 유료 캐시 확장을 추가하지 않음.
현재 정적 파일 제공과 PUBLIC 표준 Actions 실행의 무료 조건을 사용함.
Cloudflare 배포 토큰은 2027-11-06 만료. 서비스 무료 기간의 만료가 아니며,
동일 권한으로 재발급해 GitHub Secret을 교체하면 됨. 기존 배포는 토큰 만료와 별개로 유지됨.
상세 운영·비용 출처 및 갱신 방법은 [운영 안내](../docs/media-automation.md) 참고.
