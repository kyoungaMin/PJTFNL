# 협업 가이드 — 반도체 부품·소재 수요예측 AI SaaS

## 브랜치 구조

```
main                ← 안정 버전 (직접 push 금지)
  └─ develop        ← 통합 브랜치 (PR 대상)
       ├─ dev/kyoungaMin   (민경아)
       ├─ dev/jieun        (구지은)
       ├─ dev/sungmin      (김성민)
       └─ dev/dasom        (김다솜)
```

## 작업 흐름

```
1. 내 브랜치에서 작업
   git checkout dev/{본인이름}

2. 작업 후 커밋
   git add .
   git commit -m "feat: ..."
   git push origin dev/{본인이름}

3. GitHub에서 PR 생성
   dev/{본인이름} → develop

4. 팀원 1명 이상 리뷰 후 merge

5. 릴리즈 시: develop → main PR
```

## 커밋 메시지 컨벤션

| 태그 | 용도 |
|------|------|
| `feat:` | 새 기능 추가 |
| `fix:` | 버그 수정 |
| `data:` | 데이터 추가/수정 |
| `docs:` | 문서 작성/수정 |
| `refactor:` | 코드 리팩토링 |
| `chore:` | 설정, 빌드 등 기타 |

예시: `feat: 월별 수주 분석 페이지 추가`

## 개발일지

작업 후 반드시 일지를 작성합니다.

```
DEV_LOG/{git user.name}/YYYY-MM-DD.md
```

템플릿: `DEV_LOG/_TEMPLATE.md` 참고

## 주의사항

- `.env` 파일은 절대 커밋하지 않습니다 (`.gitignore`에 포함됨)
- `main` 브랜치에 직접 push 하지 않습니다
- 다른 팀원의 작업 폴더는 수정하지 않습니다
