# 미디어 자동화 연결 진행

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

최초 원격 실행과 공개 이미지 검증 진행 전. 완료 결과를 후속 기록합니다.
