import os
import sys
import subprocess
import time
import re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(BASE_DIR)
CLOUDFLARED_PATH = os.path.join(PARENT_DIR, "cloudflared.exe")
PUBLIC_URL_FILE = os.path.join(BASE_DIR, "public_url.txt")

print("=" * 60)
print(" 🚀 正在啟動 Phoneme-Worms 本地伺服器與 Cloudflare 雲端公網穿透...")
print("=" * 60)

if not os.path.exists(CLOUDFLARED_PATH):
    print(f"⚠️ 找不到 cloudflared.exe: {CLOUDFLARED_PATH}")
    print("請確認檔案是否存在於上層目錄。")
    sys.exit(1)

# 啟動 app.py
server_proc = subprocess.Popen([sys.executable, "app.py"], cwd=BASE_DIR)

time.sleep(1.5)

# 啟動 Cloudflare Tunnel
tunnel_cmd = [CLOUDFLARED_PATH, "tunnel", "--url", "http://127.0.0.1:5050"]
tunnel_proc = subprocess.Popen(
    tunnel_cmd,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    bufsize=1,
    encoding="utf-8",
    errors="replace"
)

public_url = None
print("\n⏳ 正在建立全球加速 HTTPS 公網連線...")

for line in tunnel_proc.stdout:
    match = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", line)
    if match:
        public_url = match.group(0)
        break

if public_url:
    print("\n" + "=" * 60)
    print(" 🎉 雲端公網穿透成功！您的專屬線上網址為：")
    print(f" 🌐 {public_url}")
    print(" 📱 任何手機、平板或遠端電腦皆可直接點開此網址使用！")
    print("=" * 60 + "\n")
    with open(PUBLIC_URL_FILE, "w", encoding="utf-8") as f:
        f.write(public_url)
    try:
        import webbrowser
        webbrowser.open(public_url)
    except Exception:
        pass
else:
    print("⚠️ 未能自動解析公網網址，請手動確認日誌。")

try:
    server_proc.wait()
except KeyboardInterrupt:
    print("\n🛑 正在關閉伺服器與穿透通道...")
    server_proc.terminate()
    tunnel_proc.terminate()
