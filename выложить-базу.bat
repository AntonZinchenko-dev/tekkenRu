@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Выложить базу всем пользователям

echo Шаг 1. Беру свежую версию с GitHub, чтобы не затереть чужие правки...
git pull --rebase --autostash origin main
if errorlevel 1 (echo Не получилось обновиться с GitHub. Проверь интернет или напиши в чат. & pause & exit /b 1)

echo.
echo Шаг 2. Переношу твою базу из программы в папку base...
node scripts\publish-base.mjs %*
if errorlevel 1 (pause & exit /b 1)

git diff --quiet -- base
if not errorlevel 1 (echo. & echo Выкладывать нечего. & pause & exit /b 0)

echo.
echo Что поменяется у пользователей:
git status --short -- base
echo.
set /p OK=Отправить это всем пользователям? Напиши y и нажми Enter: 
if /i not "%OK%"=="y" (
  echo Отменено. Чтобы вернуть папку base как было: git checkout -- base
  pause & exit /b 0
)

echo.
echo Шаг 3. Отправляю на GitHub (только папку base, остальные твои файлы не трогаю)...
git add -- base
git commit -m "База: обновление от %DATE%" -- base
if errorlevel 1 (pause & exit /b 1)
git push origin main
if errorlevel 1 (echo Не получилось отправить. Проверь вход в GitHub. & pause & exit /b 1)

echo.
echo Готово. Программы пользователей подтянут изменения при следующем запуске.
pause
