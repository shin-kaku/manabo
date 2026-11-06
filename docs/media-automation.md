# 이미지 제공 및 자동 동기화

방문자는 Cloudflare의 `/media/...webp`를 읽습니다. Google Sheets/Drive는 계속 편집 원본이며,
정적 배포를 만들 때만 JSON과 이미지 변경분을 가져옵니다. 원본은 Git·배포 파일에 넣지 않습니다.

## 지원 자료

| 종류 | Google JSON 필드 | 처리 | 현재 활성화 |
| --- | --- | --- | --- |
| image1 | `이미지 1` | 긴 변 480/960px, WebP 품질 85 | 예 |
| image2 | `이미지 2` | 긴 변 480/960px, 리사이즈 후 무손실 WebP | 아니요 |
| stroke | `획순 SVG`, 없으면 `획순 이미지` | SVG 원문·애니메이션 보존; 정지 래스터는 무손실 WebP | 예 |

`scripts/media-config.json`의 `enabledKinds`에 준비된 종류를 추가합니다.
이미지2 필드는 현재 Google 응답에도 있지만, 이번에는 요청하신 이미지1만 실제 일괄 변환했습니다.
이미지2 종류별 저장·조회·동기화 구조는 준비했고, 사용자용 스타일 전환 UI는 추가하지 않았습니다.
현재 Q열 `획순 이미지`의 SVG 링크를 그대로 사용합니다. 별도 열이 필요하면 Apps Script가
`획순 SVG` 필드로 내보내도록 하면 우선 적용됩니다. 동기화 시 실제 형식에 따라 SVG로 보존합니다.
SVG는 독립 파일로 표시합니다. `<animate>`, CSS, path/ID, viewBox를 보존하며,
스크립트·외부 리소스·foreignObject를 사용하는 SVG는 명확한 오류로 중단합니다.
스스로 움직이는 SVG용이며, 별도 JavaScript 실행이 필요한 SVG 플레이어는 별도 구현 대상입니다.
정적 SVG는 원래 번호·화살표를 그대로 표시하며 자동으로 애니메이션을 만들지 않습니다.
車·犬·見·空·校는 기존 Q열의 정적 SVG에 한해 `public/strokes/<한자>.svg`로 먹 획순을 시험합니다.
`src/media.js`의 파일 ID와 체크섬이 모두 일치할 때만 테스트 파일을 표시합니다. Google Drive에서 파일을 교체하거나 Q열에 새 파일을 연결한 뒤 기존 CLI·Cloudflare 동기화를 실행하면 그 글자는 새 Google 원본을 사용합니다.
테스트 중에는 동작 줄이기 설정이나 애니메이션 로딩 실패 시 기존 번호 획순도를 표시합니다.

획순은 상세 화면을 열 때만 220px 고정 크기로 표시합니다. 확대 버튼은 없으며 목록 스크롤은 획순 요청을 만들지 않습니다.

`Kanji_3_Stroke`는 이미 링크 공개된 폴더이므로 공유 권한을 바꾸지 않습니다.
서비스 계정의 기본 목록에 나오지 않는 이 폴더는 `sourceFolderIds`의 명시된 ID로 페이지 끝까지
추가 조회합니다. 새 파일도 같은 폴더에 넣고 Q열 링크를 수정하면 매일 동기화에 포함됩니다.
작은 SVG는 최대 8개, 래스터 변환은 최대 3개 동시 처리하며 변경 없는 원본은 다시 내려받지 않습니다.

## 연결과 최초 배포

2026-11-06에 전용 Google 프로젝트 `manabo-media-sync-20261106`와 Drive API,
프로젝트 IAM 역할이 없는 서비스 계정을 연결했습니다. `Kanji_1_TCG` 폴더에는 Viewer만 부여했습니다.
GitHub `shin-kaku/manabo`는 PUBLIC이며 다음 4개 Secrets 등록을 확인했습니다.

- `MANABO_SHEETS_API_URL`
- `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Cloudflare 토큰은 기존 계정의 Workers Scripts 편집 + Account Settings 읽기에 한정했습니다.
기존 Cloudflare Git 자동 빌드는 끄고 GitHub 워크플로를 배포 경로로 사용합니다.
`MEDIA_SYNC_ENABLED=true`로 활성화했습니다.
새 환경에서 최초 이미지가 없는 경우 수동 실행(`force_deploy=true`)으로 Google 원본에서 생성합니다.
이후 캐시와 운영 파일을 재사용합니다.
2026-11-06 최초 원격 배포 및 모바일·PC 공개 페이지 검증을 완료했습니다.
후속 실행에서 2,324개 재사용·원본 다운로드 0건·재배포 생략을 확인했습니다.
상세 결과는 [연결 완료 기록](../reports/media-connection-2026-11-06.md)에 있습니다.

일반 CI는 자동화가 켜진 master push에서 중복 실행하지 않습니다. 이때 sync 작업이 단위·브라우저
테스트와 빌드를 모두 수행합니다. PR 및 다른 브랜치는 일반 CI로 검증합니다.
수동 실행의 `force_deploy=true`는 데이터가 같아도 재배포할 때 사용합니다.

### 1년 뒤 토큰 갱신

현재 Cloudflare 토큰의 만료일은 **2027-11-06**입니다. 무료 서비스 종료일이 아닙니다.
만료되면 새 자동 배포 인증만 실패하며 이미 배포된 사이트와 이미지는 유지됩니다.
만료 전에 같은 계정·같은 권한으로 새 토큰을 발급해 GitHub의 `CLOUDFLARE_API_TOKEN` 값을
교체하고, 수동 실행(`force_deploy=true`)으로 검증합니다. 토큰 갱신은 유료 플랜 전환이 아닙니다.
Google 서비스 계정 키는 이 1년 만료 설정과 별개이며 현재 자동 만료가 설정되어 있지 않습니다.
비밀 값은 채팅·문서·Git에 붙이지 않고 GitHub의 암호화된 Secrets에만 등록합니다.

## 이후 자동 동작

`.github/workflows/sync-media.yml`은 Google 변경분을 매일 오전 **8시 17분(일본 시간)**에
한 번 확인합니다. UTC cron은 `17 23 * * *`이며, 중복 실행을 직렬화합니다.
master push는 Google을 조회하지 않고 게시된 카탈로그·이미지로 코드만 배포합니다.
필요할 때는 수동 실행으로 추가 동기화할 수 있습니다. 아래 Google 동기화 단계는 예약·수동 실행에 적용됩니다.

1. Google JSON을 검증하고 한자 ID로 병합합니다. 기존 학습 순서는 유지합니다.
   霧·六·勘의 예시 교정과 食의 삭제된 이미지 링크 교정은 `scripts/data-corrections.json`의 알려진 구버전 값과 일치할 때만 적용합니다.
   새 Google 편집을 영구적으로 덮어쓰지 않습니다. 기존 한자/독해 삭제는 자동 승인하지 않습니다.
2. 서비스 계정이 볼 수 있는 Drive 파일의 체크섬 목록을 페이지 끝까지 조회합니다.
   브라우저나 스크롤에서는 이 API를 호출하지 않습니다.
3. 원본 MD5와 변환 설정이 같으면 기존 WebP를 재사용합니다. 같은 Drive URL에 덮어쓴 수정도 감지합니다.
   캐시가 없으면 기존 운영 WebP를 해시 검증 후 복원합니다. 그것도 없으면 Drive 원본에서 재생성합니다.
4. 바뀐 원본만 다운로드하고 MD5를 대조합니다. 다운로드 중 원본이 바뀌면 전체 배포를 중단합니다.
   새 파일 이름은 실제 출력 바이트의 SHA-256입니다. 오래된 브라우저 캐시와 새 수정본이 섞이지 않습니다.
5. 변환 파일을 검증해 먼저 캐시에 저장하므로 뒤의 검사 실패로 변환 결과를 잃지 않습니다.
   변경이 없으면 테스트·빌드·배포를 건너뜁니다. 변경된 경우 테스트, 빌드, 무료 한도/파일 검증 후 배포합니다.
   도중 오류는 새 운영 배포를 만들지 않습니다. 배포 후 JSON/카탈로그만 Git에 기록합니다.
   Git push 실패 시 배포 자체는 이미 완료된 상태이므로 로그를 보고 다음 실행에서 저장소를 맞춥니다.
6. 카드 요청은 기존 가상 스크롤의 가시성·160ms 정지·동시 2개 제한을 계속 사용합니다.
   카드 480px, 상세·확대 960px이며 변환본 실패 시 기존 Drive 주소를 대체 경로로 사용합니다.
   SVG는 썸네일로 변환하지 않습니다.

스케줄은 실시간 보장이 아닙니다. GitHub 부하에 따라 늦어질 수 있고,
PUBLIC 저장소가 60일간 비활성 상태면 예약 실행이 비활성화될 수 있습니다.
변경 없이 장기간 운영할 때는 Actions 상태를 확인하고 필요하면 다시 활성화합니다.
[GitHub schedule 문서](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

## 비용과 한도

Cloudflare Workers의 **정적 파일 제공**만 사용합니다. 이미지 변환은 GitHub에서 처리하고,
Cloudflare Images, R2, Worker 요청별 변환은 사용하지 않습니다.
공식 문서상 정적 파일 요청은 무료이며, Free 플랜은 배포당 20,000파일·파일당 25 MiB 제한이 있습니다.
`npm run build` 마지막에 실제 배포 폴더를 검사하고 초과하면 배포 전에 실패합니다.
[Cloudflare 정적 파일 비용](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/),
[플랫폼 한도](https://developers.cloudflare.com/workers/platform/limits/)

현재 PUBLIC 저장소의 표준 Ubuntu Actions runner는 무료 대상입니다.
캐시만 사용하며 장기 보관용 Actions artifact를 업로드하지 않습니다.
기본 캐시 무료 범위는 저장소당 10GB입니다. 캐시 유료 확장/추가 예산을 켜지 말고 기본 한도를 유지합니다.
캐시 소실은 속도에만 영향을 주며 원본/운영 이미지로 복구할 수 있습니다.
미디어 자동화는 PRIVATE 저장소에서는 실행되지 않도록 제한했습니다.
PRIVATE 전환 시 일반 CI를 포함한 실행 시간 과금 조건을 다시 검토해야 합니다.
[GitHub Actions 요금](https://docs.github.com/en/billing/concepts/product-billing/github-actions)

이미지1은 고유 이미지 파일 4,640개입니다. 획순을 포함한 실제 파일 수는 빌드 출력으로 확인합니다.
이미지2 2종 크기와 획순 SVG 1종을 2,324자 전체에 추가해도 대략 11,668파일로,
현재 규모에서는 Free 한도 안입니다. 실제 파일 수는 매번 검사합니다.

Google Drive API도 현재 무료 기준 안에서 사용합니다. 현행 공식 한도는 프로젝트별 일일
전송 1TB와 4억 quota units이며, 최초 이미지1 원본 전체는 약 5.37GB입니다.
방문자 수만큼 Drive 원본을 내려받는 구조가 아니므로 일반 운영에서는 변경분만 사용합니다.
Google의 향후 과금 정책 변경은 별도 확인 대상이며, 이번 프로젝트에 결제 계정을 연결하지 않았습니다.
[Google Drive API 사용 한도](https://developers.google.com/workspace/drive/api/guides/limits)

## 로컬 명령

```sh
# 이미 준비한 원본 사용 (원본을 수정하지 않음)
npm run sync-media -- --local=.local-assets/kanji-1-tcg/manifest.json

# Google 연결 후: 셸에 비밀 값을 안전하게 주입한 상태
npm run sync-data
npm run sync-media
npm run test:unit
npm run test:browser
npm run build
```

`public/data/media.json`은 커밋 대상 카탈로그입니다. `public/media/`는 재생성 가능한 파일입니다.
`npm run build`는 누락된 파일을 마지막 운영 배포에서 복원하고 해시를 검사합니다.
초기 운영 업로드 전 새 환경에서는 인증된 `sync-media` 또는 로컬 원본 변환을 먼저 실행해야 합니다.
출력에 있는 SHA는 파일 이름용 무결성 값이며 Google 인증 정보가 아닙니다.
