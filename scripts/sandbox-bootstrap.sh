#!/bin/bash
# Единый вход для всех лаб Antigravity Academy в облачных песочницах.
# Определяет платформу и доустанавливает недостающие инструменты.
# Документация: labs/SANDBOX_SETUP.md
set -e

if   [ -n "$CODESPACE_NAME" ];      then PLATFORM=codespaces
elif [ -n "$GITPOD_WORKSPACE_ID" ]; then PLATFORM=gitpod
elif [ -n "$CLOUD_SHELL" ];         then PLATFORM=cloudshell
else                                     PLATFORM=local
fi
echo "Sandbox platform: $PLATFORM"

command -v pandoc >/dev/null 2>&1 || sudo apt-get install -y -qq pandoc 2>/dev/null || \
  echo "pandoc не установлен — HTML-сборка уроков будет пропущена"

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && \
  sudo apt-get install -y nodejs
fi

command -v gemini >/dev/null 2>&1 || npm install -g @google/gemini-cli 2>/dev/null || \
  echo "Gemini CLI не установлен — поставь вручную: npm i -g @google/gemini-cli"

if [ -f scripts/convert_lessons.py ] && command -v pandoc >/dev/null 2>&1; then
  python3 scripts/convert_lessons.py || true
fi

echo ""
echo "Bootstrap завершён. Запусти превью академии:"
echo "  python3 -m http.server 8080"
echo "Открой:  http://localhost:8080/lessons/   и   /labs/"
