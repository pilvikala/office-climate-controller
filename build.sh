set -euo pipefail

npm run build

# Ensure dist directory exists
mkdir -p dist

# Copy static assets and metadata
cp -r public ./dist/
cp package.json ./dist/package.json
cp package-lock.json ./dist/package-lock.json
cp scripts/install-weather-cron-dietpi.sh ./dist/install-weather-cron-dietpi.sh

# Derive version for this build. Prefer APP_VERSION (e.g. from CI),
# otherwise fall back to "dev".
VERSION="${APP_VERSION:-dev}"

cat > dist/version.json <<EOF
{ "version": "${VERSION}" }
EOF

# Also ensure the UI under /public can read the same version file
if [ -d "dist/public" ]; then
  cp dist/version.json dist/public/version.json
fi

tar -czvf office-climate-controller.tar.gz dist/*
