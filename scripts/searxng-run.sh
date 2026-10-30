#!/usr/bin/env bash
# Runs the local SearXNG installed by searxng-setup.sh, in the foreground, on 127.0.0.1:8888 only.
set -euo pipefail
cd "$HOME/searxng"
export SEARXNG_SETTINGS_PATH="$HOME/.config/ez-shop-searxng/settings.yml"
export PYTHONPATH=.
exec .venv/bin/python searx/webapp.py
