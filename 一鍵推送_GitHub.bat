@echo off
chcp 65001 >nul
title 推送至 GitHub - Phoneme-Worms
echo ========================================================
echo   🚀 正在將最新專案設計推送至 Phoneme-Worms 儲存庫...
echo ========================================================

cd /d "%~dp0"

git status
echo.
set /p commit_msg="請輸入本次更新說明 (直接按 Enter 預設為 'update: project design updates'): "
if "%commit_msg%"=="" set commit_msg=update: project design updates

echo.
echo [1/3] 加入變更檔案...
git add .

echo [2/3] 提交本地 Commit...
git commit -m "%commit_msg%"

echo [3/3] 推送至遠端 GitHub (main)...
git push origin main

echo.
echo ========================================================
echo   ✅ 推送完成！已同步至 https://github.com/qwu302383-lang/Phoneme-Worms
echo ========================================================
pause
