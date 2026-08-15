#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

# Termux-packages invokes this recipe from a checked-out source tree. The recipe
# only stages files under the package build directory; installation remains the
# responsibility of the Termux package manager.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TERMUX_PREFIX="${TERMUX_PREFIX:-/data/data/com.termux/files/usr}"
OUTPUT_DIR="${TERMUX_PKG_TMPDIR:-$REPO_ROOT/.termux-build}"

bash "$REPO_ROOT/scripts/build-termux-release.sh" \
	--output "$OUTPUT_DIR" \
	--version "${RECODE_VERSION:-0.1.5}" \
	--revision "${RECODE_REVISION:-1}" \
	--architecture "${TERMUX_ARCH:-aarch64}" \
	--prefix "$TERMUX_PREFIX" \
	--skip-build \
	--stage-only
