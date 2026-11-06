# GitHub Actions 실패 기록 검토 — 2026-11-06

## 확인한 실행과 원인

| 실행 | 실패한 테스트 | 로그에서 확인한 원인 |
| --- | --- | --- |
| [루비 제작](https://github.com/shin-kaku/manabo/actions/runs/42025627008) | 루비 2개 | `/private/tmp/manabo-example-ruby-*.png` 저장 시 `ENOENT` |
| [261105_아스트라 검증 개선](https://github.com/shin-kaku/manabo/actions/runs/42034523691) | 루비 2개 | 같은 Mac 전용 저장 경로 |
| [버츄얼 스크롤 적용 개선](https://github.com/shin-kaku/manabo/actions/runs/42058721952) | 루비 2개, 가상 스크롤 2개 | 루비 및 `/private/tmp/manabo-virtual-grid-*.png` 저장 경로 |
| [최적화 이미지 자동화 첫 실행](https://github.com/shin-kaku/manabo/actions/runs/42090621423) | 루비 2개, 가상 스크롤 2개 | 같은 저장 경로 |

네 실행의 실패는 기능 검증 결과를 화면 파일로 저장하는 단계에서 발생했다.
Linux runner에 Mac 전용 `/private/tmp` 디렉터리가 없어 실패했으며,
가상 스크롤의 DOM 수·네트워크 요청이나 루비 정렬 검증 자체의 실패는 기록되지 않았다.
단, 파일 저장 뒤의 검증은 그 실행에서 수행되지 않았으므로 후속 성공 실행으로 확인한다.

## 이미 적용된 수정

커밋 `9b8f0c23b655e7936bfdb5df2ae386b21127e893`에서 두 테스트의 저장 위치를
Playwright의 `testInfo.outputPath(...)`로 변경했다. 운영체제별 절대 경로 대신
테스트별 출력 디렉터리를 사용하므로 Linux에서도 저장할 수 있다.
[수정 직후 실행](https://github.com/shin-kaku/manabo/actions/runs/42093827828)과
[검토 직전 최신 실행](https://github.com/shin-kaku/manabo/actions/runs/42158824545)은 성공했다.
최신 실행은 단위 테스트 48개, 브라우저 테스트 61개, 빌드 및 배포를 통과했다.

## 이번 보강

- `Validate Manabo`에 수동 실행을 추가해 선택한 브랜치의 최신 코드를 배포 없이 재검증한다.
- 단위 테스트와 브라우저 테스트를 별도 단계로 표시해 실패 위치를 쉽게 찾는다.
- 두 워크플로 모두 브라우저 실패 시 HTML 보고서·스크린샷·trace를 Artifacts에 3일간 보관한다.
- CI 보고서에는 GitHub 오류 위치 표시를 추가한다. 테스트 재시도로 실패를 숨기지 않는다.
- 공개 배포 워크플로가 실행되지 않는 비공개 저장소에서도 기본 검증이 생략되지 않게 조건을 맞춘다.
- 사이트 화면, 글자 크기, Google 하루 1회 갱신 주기는 변경하지 않는다.

과거 실행을 재시도하면 원래 커밋을 다시 검사한다.
수정된 최신 상태 확인에는 `Validate Manabo → Run workflow → master`를 사용한다.
과거 실패 기록은 삭제하지 않는다.

근거: [GitHub 재실행 동작](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs),
[Playwright CI 보고서](https://playwright.dev/docs/ci).
