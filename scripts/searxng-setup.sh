#!/usr/bin/env bash
# Installs SearXNG (free, open source) for EZ-Shop's web search, in the user's home, without Docker or sudo.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh
[ -d "$HOME/searxng" ] || git clone --depth 1 https://github.com/searxng/searxng.git "$HOME/searxng"
cd "$HOME/searxng"
[ -x .venv/bin/python ] || uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
CONFIG="$HOME/.config/ez-shop-searxng"
mkdir -p "$CONFIG"
if [ ! -f "$CONFIG/settings.yml" ]; then
  KEY=$(.venv/bin/python -c 'import secrets; print(secrets.token_hex(32))')
  cat > "$CONFIG/settings.yml" <<YML
use_default_settings: true
general:
  instance_name: "EZ-Shop local search"
  enable_metrics: false
server:
  bind_address: "127.0.0.1"
  port: 8888
  secret_key: "$KEY"
  limiter: false
  public_instance: false
  image_proxy: false
search:
  safe_search: 0
  formats:
    - html
    - json
YML
  chmod 600 "$CONFIG/settings.yml"
fi
echo "SearXNG is installed. Start it with: npm run search:start"
