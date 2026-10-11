# 원묵고 정기고사 관리 시스템

기존 3개 앱(exam-auto, exam-gen, exam-docs)을 하나로 합친 통합 앱입니다.

| 주소 | 메뉴 | 사용자 |
|---|---|---|
| `/` | 시험 시간표 (구 exam-gen) | 누구나 조회 (로그인 불필요) · 관리 기능은 관리자 |
| `/status/` | 시험 현황 자동화 (구 exam-auto) | 관리자 |
| `/docs/` | 응시현황표·자리배치표 (구 exam-docs) | 관리자 |
| `/admins/` | 관리자 구성원 추가·삭제 | 기본 관리자 |

## 데이터 구조 (Firebase 프로젝트 `test-e7132`)

- `timetable_config/*` — **시험 데이터 단일 원본.** 시험 시간표와 응시현황표·자리배치표가 함께 사용
  - `data_{학년도}_{학기}_{midterm|final}_{학년}`: 학년별 명렬표 행(학번·이름·날짜·교시·과목·코드·고사실·지도교사)
  - `active`: 등록 목록(catalog), 기본 학사 정보, 학교 로고
- `school_data/*` — 시험 현황 자동화 데이터 (elective-70356에서 이전)
- `exam_admins/{이메일}` — 관리자 목록 (관리자 구성원 메뉴에서 기본 관리자가 관리)
- `exams`, `settings` — 구 exam-docs 전용. 통합 앱은 더 이상 사용하지 않음 (규칙은 변경하지 않음)

## 처음 설정 (Firebase 콘솔, test-e7132)

1. **Authentication → 로그인 방법 → Google 사용 설정**
2. **Authentication → 설정 → 승인된 도메인**에 Vercel 배포 도메인 추가: `exam-system-amber.vercel.app`
3. **Firestore → 규칙**에 `firestore.rules` 내용 붙여넣고 게시
4. 배포된 앱에서 관리자 로그인 → `시험 현황 자동화` 메뉴 → **기존 데이터 가져오기** 1회 실행

`kkhland@gmail.com`은 기본 관리자입니다(`src/shared/auth.ts`의 `DEFAULT_ADMINS`, `firestore.rules`).
관리자 추가·삭제는 기본 관리자로 로그인한 뒤 상단 **관리자 구성원** 메뉴(`/admins/`)에서 합니다.

## 개발

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # dist/ (Vercel: Framework = Vite, Output = dist)
```

로컬 실행도 실제 운영 DB(test-e7132)에 연결됩니다. 테스트 중 저장·삭제 버튼에 주의하세요.
