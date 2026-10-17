@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Установка TekkenRU

rem программа должна быть закрыта, иначе не обновится
taskkill /im TekkenRU.exe /f >nul 2>&1

set "ZIP=%~dp0TekkenRU-win-x64.zip"
set "DEST=%~dp0TekkenRU"
set "APPD=%DEST%\TekkenRU-win32-x64"
set "EXE=%APPD%\TekkenRU.exe"

rem 1) склеить архив из частей, если его ещё нет
if not exist "%ZIP%" (
  if exist "TekkenRU.part0" (
    echo Склеиваю архив из частей...
    copy /b TekkenRU.part0+TekkenRU.part1+TekkenRU.part2+TekkenRU.part3+TekkenRU.part4 "%ZIP%" >nul
  ) else (
    echo Не нашёл ни TekkenRU-win-x64.zip, ни частей TekkenRU.part*. & pause & exit /b 1
  )
)

rem 2) распаковать (один раз)
if not exist "%EXE%" (
  echo Распаковываю программу, это займёт около минуты...
  if not exist "%DEST%" mkdir "%DEST%"
  tar -xf "%ZIP%" -C "%DEST%" 2>nul
  if not exist "%EXE%" powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%DEST%' -Force"
)
if not exist "%EXE%" (echo Не получилось распаковать архив. & pause & exit /b 1)

rem 3) обновление программы (свежая версия)
rem    файл приходит как app-asar.bin: файлы .asar нельзя надёжно переслать, поэтому переименовываем при копировании
if exist "%~dp0update\app-asar.bin" (
  echo Обновляю программу...
  copy /y "%~dp0update\app-asar.bin" "%APPD%\resources\app.asar" >nul
  if errorlevel 1 (echo Не получилось обновить: закрой TekkenRU и запусти установку ещё раз. & pause & exit /b 1)
) else if exist "%~dp0update\app.asar" (
  echo Обновляю программу...
  copy /y "%~dp0update\app.asar" "%APPD%\resources\app.asar" >nul
)

rem 3б) иконка Кинга на exe (нужен Node.js — он у тебя есть для npm start)
if exist "%~dp0update\set-icon.cjs" (
  where node >nul 2>&1 && node "%~dp0update\set-icon.cjs" "%EXE%" "%~dp0update\king.ico"
)

rem 3в) постоянные данные (все персонажи на русском + версия игры) — кладём рядом с программой
if exist "%~dp0update\base\characters.json" (
  echo Кладу базу персонажей рядом с программой...
  xcopy "%~dp0update\base" "%APPD%\base" /E /I /Y /Q >nul
)

rem 4) общая база с версией из исходников: пустую папку data рядом с exe убираем,
rem    тогда программа берёт базу из %%APPDATA%%\TekkenRU (там уже лежат русские гайды)
rmdir "%APPD%\data" 2>nul

rem 5) снять пометку «скачано из интернета», чтобы Windows не ругалась
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%APPD%' -Recurse -File | Unblock-File" >nul 2>&1

rem 6) ярлык на рабочем столе
rem    иконка берётся из отдельного .ico — так Windows не подсовывает старую из кэша
copy /y "%~dp0update\king.ico" "%APPD%\TekkenRU.ico" >nul
del "%USERPROFILE%\Desktop\TekkenRU.lnk" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop');Remove-Item -LiteralPath ($d+'\TekkenRU.lnk') -ErrorAction SilentlyContinue;$s=(New-Object -ComObject WScript.Shell).CreateShortcut($d+'\TekkenRU.lnk');$s.TargetPath='%EXE%';$s.WorkingDirectory='%APPD%';$s.IconLocation='%APPD%\TekkenRU.ico,0';$s.Save()" >nul 2>&1

rem обновить кэш иконок Windows, чтобы новая иконка показалась сразу
ie4uinit.exe -show >nul 2>&1

echo Готово! Ярлык TekkenRU на рабочем столе. Запускаю...
start "" "%EXE%"
timeout /t 3 >nul
