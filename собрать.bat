@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Собираю архив из частей...
copy /b TekkenRU.part0+TekkenRU.part1+TekkenRU.part2+TekkenRU.part3+TekkenRU.part4 TekkenRU-win-x64.zip >nul
if errorlevel 1 (echo Не хватает частей: положи все файлы TekkenRU.part* в эту папку & pause & exit /b 1)
echo Готово: TekkenRU-win-x64.zip — распакуй его и запусти TekkenRU.exe
pause
