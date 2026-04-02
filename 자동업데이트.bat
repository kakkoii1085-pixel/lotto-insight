@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo ================================================
echo   로또 인사이트 자동 업데이트
echo ================================================
echo.

REM Python 경로 확인
where python > nul 2>&1
if errorlevel 1 (
    echo [오류] Python이 설치되어 있지 않거나 PATH에 없습니다.
    pause
    exit /b 1
)

REM requests 설치 확인
python -c "import requests" > nul 2>&1
if errorlevel 1 (
    echo requests 설치 중...
    pip install requests urllib3
)

echo [1/3] 새 회차 데이터 수집 중...
python scripts\update_lotto_csv.py
if errorlevel 1 (
    echo [오류] 데이터 수집 실패. 인터넷 연결을 확인하세요.
    pause
    exit /b 1
)

echo.
echo [2/3] Git 변경사항 확인 및 커밋...
git diff --quiet public\lotto_numbers.csv public\lotto_history_details.json 2>nul
if errorlevel 1 (
    for /f "tokens=*" %%d in ('powershell -command "Get-Date -Format 'yyyy-MM-dd'"') do set TODAY=%%d
    git add public\lotto_numbers.csv public\lotto_history_details.json
    git commit -m "chore: 로또 데이터 자동 업데이트 %TODAY%"
    echo.
    echo [3/3] Vercel 배포를 위해 Push 중...
    git push origin main
    if errorlevel 1 (
        echo [오류] Push 실패. git 설정을 확인하세요.
        pause
        exit /b 1
    )
    echo.
    echo ✅ 완료! 1~2분 후 블로그 앱에 반영됩니다.
) else (
    echo 새로운 데이터가 없습니다. (이미 최신 상태)
)

echo.
echo ================================================
timeout /t 5
