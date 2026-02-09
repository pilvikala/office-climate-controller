npm run build
cp -r public ./dist/
cp package.json ./dist/package.json
cp package-lock.json ./dist/package-lock.json
tar -czvf office-climate-controller.tar.gz dist/*
