#!/bin/bash
# ZAM Club – Lokaler Dev-Server
# Startet einen einfachen HTTP-Server und öffnet den Browser

PORT=8080

echo "🚀 ZAM Club startet auf http://localhost:$PORT"
echo "   Zum Beenden: Strg+C"
echo ""

# Browser öffnen (je nach Betriebssystem)
if command -v open &>/dev/null; then
  # macOS
  sleep 0.5 && open "http://localhost:$PORT" &
elif command -v xdg-open &>/dev/null; then
  # Linux
  sleep 0.5 && xdg-open "http://localhost:$PORT" &
elif command -v start &>/dev/null; then
  # Windows (Git Bash)
  sleep 0.5 && start "http://localhost:$PORT" &
fi

# Server starten (Python 3 oder Python 2)
if command -v python3 &>/dev/null; then
  python3 -m http.server $PORT
elif command -v python &>/dev/null; then
  python -m SimpleHTTPServer $PORT
else
  echo "❌ Python nicht gefunden. Bitte installiere Python oder öffne index.html direkt im Browser."
fi
