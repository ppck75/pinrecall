# pinrecall

시험 공부용 학습 웹페이지입니다. 로그인한 계정별로 포스트잇 메모와 퀴즈 카드가 Supabase에 저장됩니다.

## 실행

```powershell
python -m http.server 5173
```

브라우저에서 `http://localhost:5173`을 엽니다.

## 기능

- `#signup`: 이메일, 비밀번호, 비밀번호 확인, 닉네임으로 회원가입
- `#login`: 로그인
- `#notes`: 계정별 포스트잇 메모 보드
- `#quiz`: 계정별 문제/정답 등록, 정답 보기, 다음 문제, 셔플

## 파일 구조

```text
index.html
styles.css
app.js
README.md
```
