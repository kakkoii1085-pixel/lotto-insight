@echo off
chcp 65001 > nul
cd /d "%~dp0"

:: =============================================
::   매주 여기 값만 바꾸고 더블클릭!
:: =============================================
set ROUND=1220
set DATE=2026-04-18
set N1=2
set N2=22
set N3=25
set N4=28
set N5=34
set N6=43
set BONUS=16
set WINNERS=14
set AMOUNT=2114514161
:: =============================================

echo ====================================
echo   로또 %ROUND%회 데이터 추가
echo ====================================
echo.
echo   날짜  : %DATE%
echo   번호  : %N1% %N2% %N3% %N4% %N5% %N6% + 보너스 %BONUS%
echo   당첨자: %WINNERS%명  /  %AMOUNT%원
echo.
set /p CONFIRM=추가하시겠습니까? (Y/N):Y

if /i not "%CONFIRM%"=="Y" (
    echo 취소되었습니다.
    pause
    exit /b
)

python scripts\add_round.py %ROUND% %DATE% %N1% %N2% %N3% %N4% %N5% %N6% %BONUS% %WINNERS% %AMOUNT%

if errorlevel 1 (
    echo [오류] 데이터 추가에 실패했습니다.
    pause
    exit /b
)

echo.
echo GitHub 업로드 중...
git add public\lotto_numbers.csv
git commit -m "%ROUND%회 로또 데이터 추가 (%DATE%)"
git push origin main

echo.
echo ====================================
echo   완료! 1~2분 후 앱에서 확인하세요.
echo ==========================