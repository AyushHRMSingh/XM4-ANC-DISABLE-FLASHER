#!/bin/zsh
# Serve only this app, on loopback. Stop with Control-C in this terminal.
cd -- "${0:A:h}" || exit 1
if [[ ! -d '/Applications/Google Chrome.app' ]]; then
  print 'Install desktop Google Chrome first.'
  exit 1
fi
if ! command -v python3 >/dev/null; then
  print 'python3 is needed for the localhost fallback. Try opening index.html in Chrome directly.'
  exit 1
fi
# Start before opening the browser; use an ephemeral port so another local tool cannot collide.
python3 - <<'PY'
import http.server,subprocess
from functools import partial
from pathlib import Path
handler=partial(http.server.SimpleHTTPRequestHandler,directory=str(Path.cwd()))
with http.server.ThreadingHTTPServer(('127.0.0.1',0),handler) as server:
    url=f'http://127.0.0.1:{server.server_port}/'
    print(f'XM4 flasher: {url}\nKeep this window open. Control-C stops the server.',flush=True)
    subprocess.run(['open','-a','Google Chrome',url],check=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
PY
