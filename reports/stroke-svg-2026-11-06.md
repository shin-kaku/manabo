# 획순 SVG 연결 및 운영 검증

- 원본: `学ぼう日本語` → `한자: 도감 DB` → Q열 `획순 이미지`.
- 2,324개 링크 모두 `Kanji_3_Stroke`의 SVG로 확인. 공개 폴더를 명시적으로 조회하며 공유 권한은 변경하지 않음.
- 기존 JSON 동기화로 Q열 링크 2,324개만 갱신. 한자 순서와 다른 학습 필드는 유지.
- SVG 2,324개, 총 22,751,255바이트. 모두 원본 MD5와 일치하며 정적 번호·화살표 그림임.
- SVG를 래스터화하거나 경로·번호를 다시 그리지 않음. 향후 원본에 SMIL/CSS 애니메이션이 추가되면 그대로 보존.
- 콘텐츠 해시 URL로 Cloudflare 정적 파일 제공. HTTP 200, `image/svg+xml`, 압축 전송(`zstd` 확인), 1년 immutable 캐시 확인.
- 상세 화면에서만 획순 로드. 버튼을 누르면 같은 SVG로 확대하며 흰 캔버스로 선·숫자 가독성을 유지.

## 배포

- 코드: `32b7807`, 게시 데이터: `d1fa3d2`.
- 최초 등록은 코드만 먼저 배포하지 않고 `workflow_dispatch(force_deploy=true)`로 데이터·SVG·검증·배포를 함께 실행.
- [실행 42155734918](https://github.com/shin-kaku/manabo/actions/runs/42155734918): 성공.
- Cloudflare 버전: `4f7fd922-23b2-4349-a765-3bf6a19cd246`.
- SVG 2,324개 신규 처리, 이미지1 2,324개 재사용. 배포 파일 7,020개 / 설정된 무료 한도 20,000개.
- 기존 매일 08:17 JST 동기화 유지. 이미지2는 비활성 상태를 유지.
- 원격 배포와 로컬 카탈로그가 완전히 같은지 확인한 뒤 재실행: `changed: 0, reused: 4648, skipped: 0`. 원본 재다운로드·재변환 없이 재사용.

## 검증

- 단위 48개, 브라우저 56개 통과. 애니메이션 SVG fixture의 프레임 변화와 확대·닫기·키보드 포커스 복귀 포함.
- 운영 Chromium, 390/1,280px × 화이트/다크 4개 시나리오 통과. 실제 휴대폰 실기기 검증은 아님.
- 실제 `文`, `隊`, `鬱` 표시·확대 확인. 빠른 목록 스크롤에서 획순 요청 0건.
- 한 시나리오당 선택한 SVG 3개만 요청했고 확대에 추가 요청이 없었음. Drive/Googleusercontent 이미지 요청 0건.
- 관측된 전송 크기는 HTTP 오버헤드를 포함해 약 1.7/2.9/6.4KB, 요청 시간은 17~198ms. 당시 네트워크에서 측정한 값이며 모든 환경의 보장값은 아님.

무료 운영 구조는 기존과 동일하다. 유료 이미지 변환·R2·추가 서버를 도입하지 않았다.
[Cloudflare 정적 파일 요금](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)과
[공개 저장소의 표준 GitHub Actions runner 무료 정책](https://docs.github.com/en/billing/concepts/product-billing/github-actions)을 확인했다.
