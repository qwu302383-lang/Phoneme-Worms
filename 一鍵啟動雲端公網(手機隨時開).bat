@echo off
chcp 65001 >nul
title Phoneme-Worms 雲端公網穿透啟動器
echo ========================================================
echo   🌐 正在為 Phoneme-Worms 建立雲端公網 HTTPS 網址...
echo ========================================================

cd /d "%~dp0"
python run_tunnel.py
pause
