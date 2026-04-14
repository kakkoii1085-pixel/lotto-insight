@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo ====================================
echo   로또 새 회차 데이터 추가
echo ====================================
echo.

set /p ROUND=회차 번호를 입력하세요 (예: 1219):
set /p DATE=추첨일을 입력하세요 (예: 2026-04-12):
set /p N1=1번째 번호:
set /p N2=2번째 번호:
set /p N3=3번째 번호:
set /p N4=4번째 번호:
set /p N5=5번째 번호:
set /p N6=6번째 번호:
set /p BONUS=보너스 번호:
set /p WINNERS=1등 당첨자 수 (모르면 0):
set /p AMOUNT=1등 당첨금 (모르면 0, 예: 2000000000):

echo.
echo 입력 내용 확인:
echo   회차: %ROUND%회
echo   날짜: %DATE%
echo   번호: %N1% %N2% %N3% %N4% %N5% %N6% + 보너스 %BONUS%
echo   당첨자: %WINNERS%명  /  당첨금: %AMOUNT%원
echo.
set /p CONFIRM=맞으면 Y, 다시 입력하려면 N:

if /i not "%CONFIRM%"=="Y" (
    echo 취소되었습니다.
    pause
    exit /b
)

python scripts\add_round.py %ROUND% %DATE% %N1% %N2% %N3% %N4% %N5% %N6% %BONUS% %WINNERS% %AMOUNT%

if errorlevel 1 (
    echo.
    echo [오류] 데이터 추가에 실패했습니다.
    pause
    exit /b
)

echo.
echo GitHub에 업로드 중...
git add public\lotto_numbers.csv public\lotto_numbers.csv.csv public\lotto_history_details.json
git commit -m "%ROUND%회 로또 데이터 추가 (%DATE%)"
git push origin main

echo.
echo ====================================
echo   완료! Vercel이 자동 배포됩니다.
echo   1~2분 후 앱에서 확인하세요.
echo ====================================
pause
