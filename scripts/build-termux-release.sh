#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -n "${RECODE_VERSION:-}" ]]; then
	VERSION="$RECODE_VERSION"
else
	VERSION="$(cd "$ROOT_DIR" && node -p "require('./package.json').version")"
fi
REVISION="1"
ARCHITECTURE="aarch64"
PREFIX="/data/data/com.termux/files/usr"
OUTPUT_DIR="$ROOT_DIR/.termux-build"
SKIP_BUILD=0
STAGE_ONLY=0
USE_DOCKER=0

usage() {
	cat <<'EOF'
Usage: bash scripts/build-termux-release.sh [options]

Options:
  --output DIR         Build output directory (default: .termux-build)
  --version VERSION    Recode version (default: root package version)
  --revision NUMBER    Debian revision (default: 1)
  --architecture ARCH  Package architecture (default: aarch64)
  --prefix PATH        Termux prefix (default: /data/data/com.termux/files/usr)
  --skip-build         Reuse already-built workspace dist/ trees
  --stage-only         Create the Debian staging tree without dpkg-deb
  --docker             Use debian:bookworm-slim when dpkg-deb is unavailable
EOF
}

while (($# > 0)); do
	case "$1" in
		--output)
			OUTPUT_DIR="$2"
			shift 2
			;;
		--version)
			VERSION="$2"
			shift 2
			;;
		--revision)
			REVISION="$2"
			shift 2
			;;
		--architecture)
			ARCHITECTURE="$2"
			shift 2
			;;
		--prefix)
			PREFIX="$2"
			shift 2
			;;
		--skip-build)
			SKIP_BUILD=1
			shift
			;;
		--stage-only)
			STAGE_ONLY=1
			shift
			;;
		--docker)
			USE_DOCKER=1
			shift
			;;
		-h|--help)
			usage
			exit 0
			;;
		*)
			echo "Unknown option: $1" >&2
			usage >&2
			exit 2
			;;
	esac
done

if [[ "$SKIP_BUILD" != 1 ]]; then
	(
		cd "$ROOT_DIR"
		npm run build
	)
fi

if [[ ! -f "$ROOT_DIR/packages/coding-agent/dist/cli.js" ]]; then
	echo "coding-agent dist/cli.js is missing; run the workspace build first" >&2
	exit 1
fi

STAGE_DIR="$OUTPUT_DIR/stage"
PREFIX_B64="$(printf '%s' "$PREFIX" | base64 | tr -d '\r\n')"
RECODE_TERMUX_PREFIX_B64="$PREFIX_B64" node "$ROOT_DIR/scripts/stage-termux-release.mjs" \
	--output "$STAGE_DIR" \
	--version "$VERSION" \
	--revision "$REVISION" \
	--architecture "$ARCHITECTURE"

if [[ "$STAGE_ONLY" == 1 ]]; then
	echo "Termux staging tree: $STAGE_DIR"
	exit 0
fi

PACKAGE_PATH="$OUTPUT_DIR/recode_${VERSION}-${REVISION}_${ARCHITECTURE}.deb"
rm -f "$PACKAGE_PATH"

if command -v dpkg-deb >/dev/null 2>&1; then
	chmod 755 "$STAGE_DIR/DEBIAN"
	chmod 644 "$STAGE_DIR/DEBIAN/control"
	SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-0}" dpkg-deb --build --root-owner-group "$STAGE_DIR" "$PACKAGE_PATH"
elif [[ "$USE_DOCKER" == 1 ]]; then
	if ! command -v docker >/dev/null 2>&1; then
		echo "--docker was requested but docker is unavailable." >&2
		exit 2
	fi
	mkdir -p "$OUTPUT_DIR"
	if HOST_OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd -W 2>/dev/null)"; then
		:
	else
		HOST_OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"
	fi
	HOST_PACKAGE_NAME="$(basename "$PACKAGE_PATH")"
	tar -cf - -C "$STAGE_DIR" . | MSYS_NO_PATHCONV=1 docker run --rm -i \
		-v "$HOST_OUTPUT_DIR:/out" \
		debian:bookworm-slim \
		sh -c 'rm -rf /tmp/recode-stage /tmp/recode.deb; mkdir /tmp/recode-stage; tar -xf - -C /tmp/recode-stage; chmod 755 /tmp/recode-stage/DEBIAN; chmod 644 /tmp/recode-stage/DEBIAN/control; SOURCE_DATE_EPOCH=0 dpkg-deb --build --root-owner-group /tmp/recode-stage /tmp/recode.deb; cp /tmp/recode.deb "/out/$1"' sh "$HOST_PACKAGE_NAME"
else
	echo "dpkg-deb is required to create the .deb." >&2
	echo "Use WSL, Termux, --docker, or rerun with --stage-only." >&2
	exit 2
fi

printf 'Created %s\n' "$PACKAGE_PATH"
