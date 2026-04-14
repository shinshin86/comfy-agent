# Colab cell 2/2: Start ComfyUI + cloudflared tunnel in background.
# This cell returns immediately so MCP-driven automation does not hang.
# The public URL is written to /content/comfy_url.txt once the tunnel is up.
# Poll that file (e.g. `!cat /content/comfy_url.txt`) until it is non-empty.

import os
import re
import socket
import subprocess
import threading
import time
from pathlib import Path

WORKSPACE = os.environ.get("COMFY_WORKSPACE") or f"{os.getcwd()}/ComfyUI"
PORT = int(os.environ.get("COMFY_PORT", "8188"))
URL_FILE = Path("/content/comfy_url.txt")
LOG_FILE = Path("/content/comfy.log")
TUNNEL_LOG = Path("/content/cloudflared.log")

URL_FILE.unlink(missing_ok=True)


def _wait_port(port: int, timeout: float = 600.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) == 0:
                return True
        time.sleep(0.5)
    return False


def _tunnel(port: int) -> None:
    if not _wait_port(port):
        print(f"[tunnel] ComfyUI did not open port {port} in time")
        return
    print("[tunnel] ComfyUI is up, launching cloudflared...")
    proc = subprocess.Popen(
        ["cloudflared", "tunnel", "--url", f"http://127.0.0.1:{port}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    pattern = re.compile(r"https://[-\w]+\.trycloudflare\.com")
    with TUNNEL_LOG.open("w") as log:
        for line in proc.stdout:
            log.write(line)
            log.flush()
            m = pattern.search(line)
            if m and not URL_FILE.exists():
                URL_FILE.write_text(m.group(0))
                print("[tunnel] URL:", m.group(0))


threading.Thread(target=_tunnel, args=(PORT,), daemon=True).start()

comfy_proc = subprocess.Popen(
    [
        "python",
        "main.py",
        "--dont-print-server",
        "--listen",
        "127.0.0.1",
        "--port",
        str(PORT),
    ],
    cwd=WORKSPACE,
    stdout=LOG_FILE.open("w"),
    stderr=subprocess.STDOUT,
)

print(f"ComfyUI started in background (pid={comfy_proc.pid}).")
print(f"  Logs:      {LOG_FILE}")
print(f"  Tunnel:    {TUNNEL_LOG}")
print(f"  URL file:  {URL_FILE}  (poll until non-empty)")
