#!/usr/bin/env bash
# Install hourly cron job on DietPi to refresh weather forecast via the app API.
# Run from the project root or pass BASE_URL.
#
# Usage:
#   ./scripts/install-weather-cron-dietpi.sh [BASE_URL]
#
# Examples:
#   ./scripts/install-weather-cron-dietpi.sh
#   ./scripts/install-weather-cron-dietpi.sh http://127.0.0.1:3000
#   BASE_URL=https://office-climate.local ./scripts/install-weather-cron-dietpi.sh

set -e

BASE_URL="${1:-${BASE_URL:-http://127.0.0.1:3000}}"
# Remove trailing slash
BASE_URL="${BASE_URL%/}"
REFRESH_URL="${BASE_URL}/api/weather/refresh"

CURL_PATH=$(which curl)

# Cron: at minute 0 of every hour
CRON_SCHEDULE="0 * * * *"
# Run curl silently; POST to trigger refresh (no output needed)
CRON_CMD="${CURL_PATH} -s -X POST ${REFRESH_URL} >/dev/null 2>&1"
CRON_LINE="${CRON_SCHEDULE} ${CRON_CMD}"

echo "Weather refresh cron installer (DietPi)"
echo "  BASE_URL: ${BASE_URL}"
echo "  Refresh:  ${REFRESH_URL}"
echo "  Schedule: every hour at :00"
echo ""

# Ensure cron is installed (DietPi usually has it)
if ! command -v crontab &>/dev/null; then
  echo "Installing cron..."
  sudo apt-get update -qq
  sudo apt-get install -y cron
fi
sudo systemctl enable cron
sudo systemctl start cron || true # ignore error if cron is already running

# Use current user's crontab
TMP_CRON=$(mktemp)
trap 'rm -f "$TMP_CRON"' EXIT

crontab -l 2>/dev/null || true > "$TMP_CRON"

if grep -q "api/weather/refresh" "$TMP_CRON" 2>/dev/null; then
  echo "Cron entry for weather refresh already present. Skipping."
  exit 0
fi

echo "$CRON_LINE" >> "$TMP_CRON"
crontab "$TMP_CRON"

echo "Cron entry added. Current crontab:"
crontab -l
echo ""
echo "Done. Weather forecast will be refreshed every hour."
