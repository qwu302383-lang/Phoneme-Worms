@echo off
chcp 65001 >nul
title Phoneme-Worms 英語學習平台
echo ========================================================
echo   🐛 正在啟動 Phoneme-Worms 英語學習平台...
echo ========================================================

cd /d "%~dp0"

REM 嘗試啟動瀏覽器
start "" http://localhost:5050

REM 啟動 Python Flask 伺服器
python app.py
pause
