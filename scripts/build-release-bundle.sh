#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -n "${RECODE_VERSION:-}" ]]; then
	VERSION="$RECODE_VERSION"
else
	VERSION="$(cd "$ROOT_DIR" && node -p "require('./package.json').version")"
fi
OUTPUT_DIR="$ROOT_DIR/.release/$VERSION"
INPUT_DIR=""
TERMUX_PACKAGE=""
TERMUX_EXPLICIT=0
RUN_BUILD=1
USE_DOCKER=0

usage() {
	cat <<'EOF'
Usage: bash scripts/build-release-bundle.sh [options]

Builds one low-noise release bundle containing the seven package tarballs,
the Termux package, checksums, provenance, and release notes.

Options:
  --version VERSION    Recode version (default: root package version)
  --input DIR          Reuse seven package tarballs from DIR instead of npm pack
  --termux FILE        Use this Termux .deb instead of .termux-build output
  --output DIR         Bundle output directory (default: .release/VERSION)
  --skip-build         Reuse existing dist/ trees
  --docker             Use Docker for the Termux .deb when it is missing
EOF
}

while (($# > 0)); do
	case "$1" in
		--version)
			VERSION="$2"
			shift 2
			;;
		--input)
			INPUT_DIR="$2"
			shift 2
			;;
		--termux)
			TERMUX_PACKAGE="$2"
			TERMUX_EXPLICIT=1
			shift 2
			;;
		--output)
			OUTPUT_DIR="$2"
			shift 2
			;;
		--skip-build)
			RUN_BUILD=0
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

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
	echo "Invalid version: $VERSION" >&2
	exit 2
fi
if [[ "$OUTPUT_DIR" != /* ]]; then OUTPUT_DIR="$ROOT_DIR/$OUTPUT_DIR"; fi
case "$OUTPUT_DIR" in
	"$ROOT_DIR/.release/"*) ;;
	*)
		echo "Refusing to replace output outside $ROOT_DIR/.release: $OUTPUT_DIR" >&2
		exit 2
		;;
esac

if [[ "$RUN_BUILD" == 1 ]]; then
	(
		cd "$ROOT_DIR"
		npm run build
	)
fi

WORK_DIR="$ROOT_DIR/.release-work/$VERSION"
if [[ -z "$INPUT_DIR" ]]; then
	INPUT_DIR="$WORK_DIR/input"
	rm -rf "$INPUT_DIR"
	mkdir -p "$INPUT_DIR"
	for workspace in \
		@reitaard/recode-agent-core \
		@reitaard/recode-ai \
		@reitaard/recode-coding-agent \
		@reitaard/recode-orchestrator \
		@reitaard/recode-storage-sqlite-node \
		@reitaard/recode-telemetry \
		@reitaard/recode-tui; do
		PACK_LOG="$WORK_DIR/npm-pack.log"
		if ! (
			cd "$ROOT_DIR"
			npm pack --workspace "$workspace" --pack-destination "$INPUT_DIR" --ignore-scripts >"$PACK_LOG" 2>&1
		); then
			cat "$PACK_LOG" >&2
			exit 1
		fi
	done
else
	INPUT_DIR="$(cd "$INPUT_DIR" && pwd)"
fi

if [[ "$TERMUX_EXPLICIT" == 0 ]]; then
	TERMUX_PACKAGE="$ROOT_DIR/.termux-build/recode_${VERSION}-1_aarch64.deb"
	TERMUX_ARGS=(--skip-build)
	if [[ "$USE_DOCKER" == 1 ]]; then TERMUX_ARGS+=(--docker); fi
	bash "$ROOT_DIR/scripts/build-termux-release.sh" "${TERMUX_ARGS[@]}"
fi
if [[ ! -f "$TERMUX_PACKAGE" ]]; then
	echo "Termux package not found: $TERMUX_PACKAGE" >&2
	exit 1
fi

PACKAGE_FILES=(
	"reitaard-recode-agent-core-${VERSION}.tgz"
	"reitaard-recode-ai-${VERSION}.tgz"
	"reitaard-recode-coding-agent-${VERSION}.tgz"
	"reitaard-recode-orchestrator-${VERSION}.tgz"
	"reitaard-recode-storage-sqlite-node-${VERSION}.tgz"
	"reitaard-recode-telemetry-${VERSION}.tgz"
	"reitaard-recode-tui-${VERSION}.tgz"
)

BUNDLE_ROOT="$WORK_DIR/bundle/recode-$VERSION"
rm -rf "$BUNDLE_ROOT"
mkdir -p "$BUNDLE_ROOT/packages" "$BUNDLE_ROOT/termux"
for package_file in "${PACKAGE_FILES[@]}"; do
	if [[ ! -f "$INPUT_DIR/$package_file" ]]; then
		echo "Missing package tarball: $INPUT_DIR/$package_file" >&2
		exit 1
	fi
	cp "$INPUT_DIR/$package_file" "$BUNDLE_ROOT/packages/$package_file"
done
TERMUX_NAME="$(basename "$TERMUX_PACKAGE")"
cp "$TERMUX_PACKAGE" "$BUNDLE_ROOT/termux/$TERMUX_NAME"

SOURCE_COMMIT="$(cd "$ROOT_DIR" && git rev-parse HEAD)"
if [[ -n "$(cd "$ROOT_DIR" && git status --porcelain)" ]]; then
	WORKING_TREE="modified"
else
	WORKING_TREE="clean"
fi
cat > "$BUNDLE_ROOT/RELEASE_NOTES.md" <<EOF
# Recode ${VERSION}

## Key item

- Added the Termux/aarch64 release candidate.
- Replaced the noisy per-package release asset list with this single bundle containing all seven package tarballs, the Termux package, checksums, provenance, and these notes.
- Third-party extensions and optional web research are not bundled. Install web access separately with \`pi install npm:pi-web-access\`.
EOF

cat > "$BUNDLE_ROOT/PROVENANCE.json" <<EOF
{
	"schemaVersion": 1,
	"release": "recode",
	"version": "${VERSION}",
	"source": {
		"repository": "https://github.com/reitaard/recode",
		"commit": "${SOURCE_COMMIT}",
		"workingTree": "${WORKING_TREE}"
	},
	"artifacts": {
		"packageTarballs": 7,
		"termux": "${TERMUX_NAME}",
		"extensionsBundled": false,
		"optionalWebAccess": "pi install npm:pi-web-access"
	},
	"limitations": [
		"Termux/aarch64 remains a release candidate until real-device certification",
		"native clipboard and TUI addons are omitted"
	]
}
EOF

node "$ROOT_DIR/scripts/generate-release-bundle-manifest.mjs" --root "$BUNDLE_ROOT" --version "$VERSION"

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"
BUNDLE_NAME="recode-${VERSION}-bundle.tar.gz"
BUNDLE_TAR="$OUTPUT_DIR/recode-${VERSION}-bundle.tar"
tar --sort=name --mtime='@0' --owner=0 --group=0 --numeric-owner -C "$(dirname "$BUNDLE_ROOT")" -cf "$BUNDLE_TAR" "recode-${VERSION}"
gzip -n -f "$BUNDLE_TAR"
mv "$BUNDLE_TAR.gz" "$OUTPUT_DIR/$BUNDLE_NAME"
(
	cd "$OUTPUT_DIR"
	sha256sum "$BUNDLE_NAME" | sed 's/ \*/  /' > "$BUNDLE_NAME.sha256"
)
printf 'Created %s\n' "$OUTPUT_DIR/$BUNDLE_NAME"
printf 'Created %s\n' "$OUTPUT_DIR/$BUNDLE_NAME.sha256"
