#!/bin/sh

set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root"

architecture=${1:-arm64}
version=$(node -p "require('./package.json').version")
app_path="out/FaceGuard-darwin-${architecture}/FaceGuard.app"
pkg_path="out/FaceGuard-${version}-${architecture}.pkg"

pnpm exec electron-forge package --platform=darwin --arch="$architecture"

if [ ! -d "$app_path" ]; then
  echo "Packaged application was not created at $app_path" >&2
  exit 1
fi

pkgbuild \
  --component "$app_path" \
  --install-location /Applications \
  --scripts installer/scripts \
  --identifier au.edu.torrens.faceguard.prototype \
  --version "$version" \
  "$pkg_path"

echo "Created $pkg_path"
