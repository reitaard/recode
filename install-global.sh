#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
	printf 'install-global.sh: ERROR: %s\n' "$*" >&2
	exit 1
}

on_error() {
	local status=$? line=$1 command=$2
	printf 'install-global.sh: ERROR: command failed with exit %s at line %s: %s\n' "$status" "$line" "$command" >&2
	exit "$status"
}
trap 'on_error "$LINENO" "$BASH_COMMAND"' ERR

log() {
	printf 'install-global.sh: %s\n' "$*"
}

remove_stale_legacy_shims() {
	local command shim_win shim legacy_package
	for command in recode pi; do
		while IFS= read -r shim_win; do
			[[ -n "$shim_win" ]] || continue
			shim="$(cygpath -u "$shim_win")"
			[[ -f "$shim" ]] || continue
			if grep -Fq '@reitaard\repi-coding-agent\dist\' "$shim"; then
				log "Removing stale $command shim at $shim_win"
				rm -f "$shim"
				legacy_package="$(dirname "$shim")/node_modules/@reitaard/repi-coding-agent"
				if [[ -d "$legacy_package" ]]; then
					log "Removing stale package directory at $legacy_package"
					rm -rf "$legacy_package"
				fi
			fi
		done < <(where.exe "$command" 2>/dev/null | tr -d '\r' || true)
	done
}

case "$(uname -s)" in
	MINGW*|MSYS*) ;;
	*) fail "Run this script from Git Bash on Windows, not WSL or PowerShell. Detected: $(uname -s)" ;;
esac

for command in git node npm cygpath tar sha256sum powershell.exe; do
	command -v "$command" >/dev/null 2>&1 || fail "Required command is missing: $command"
done

ROOT_WIN="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "Run this script inside the Recode repository"
ROOT="$(cygpath -u "$ROOT_WIN")"
cd "$ROOT"

[[ "$(git branch --show-current)" == "main" ]] || fail "Current branch must be main"
[[ -z "$(git status --porcelain)" ]] || fail "Checkout is dirty; use a clean released checkout"

VERSION="$(node -p "require('./package.json').version")"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "Invalid package version: $VERSION"
COMMIT="$(git rev-parse HEAD)"
GLOBAL_ROOT_WIN="$(npm root --global)"
GLOBAL_PREFIX_WIN="$(npm prefix --global)"
GLOBAL_ROOT="$(cygpath -u "$GLOBAL_ROOT_WIN")"
GLOBAL_PREFIX="$(cygpath -u "$GLOBAL_PREFIX_WIN")"

if powershell.exe -NoProfile -NonInteractive -Command 'if (Get-Process -Name recode,recode-maestro -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }'; then
	fail "A Recode process is still running. Close every Recode window before installation."
fi

AGENT_DIR_WIN="${PI_CODING_AGENT_DIR:-$USERPROFILE\\.pi\\agent}"
AGENT_DIR="$(cygpath -u "$AGENT_DIR_WIN")"
BACKUP_ROOT="$ROOT/../recode-backups"
BACKUP="$BACKUP_ROOT/agent-before-recode-$VERSION-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
mkdir -p "$BACKUP_ROOT"
if [[ -d "$AGENT_DIR" ]]; then
	log "Backing up existing sessions and settings to $BACKUP"
	tar -czf "$BACKUP" -C "$(dirname "$AGENT_DIR")" "$(basename "$AGENT_DIR")"
	[[ -s "$BACKUP" ]] || fail "Agent-data backup was not created"
else
	log "No existing agent directory found at $AGENT_DIR_WIN"
fi

if [[ -d "$GLOBAL_ROOT/@reitaard/repi-coding-agent" ]]; then
	log "Removing the previous global coding-agent package after the data backup"
	npm uninstall --global --ignore-scripts @reitaard/repi-coding-agent
fi
remove_stale_legacy_shims

log "Certifying source commit $COMMIT"
npm ci --ignore-scripts
npm run check
npm run build

OUT_ROOT="${TEMP:-${TMPDIR:-/tmp}}/recode-global-$VERSION-$(git rev-parse --short HEAD)"
OUT_ROOT="$(cygpath -u "$OUT_ROOT" 2>/dev/null || printf '%s' "$OUT_ROOT")"
rm -rf "$OUT_ROOT"
mkdir -p "$OUT_ROOT/packages" "$OUT_ROOT/smoke"

PACKAGE_DIRS=(
	packages/telemetry
	packages/ai
	packages/agent
	packages/storage/sqlite-node
	packages/tui
	packages/coding-agent
	packages/orchestrator
)
for package_dir in "${PACKAGE_DIRS[@]}"; do
	(cd "$package_dir" && npm pack --ignore-scripts --pack-destination "$OUT_ROOT/packages" >/dev/null)
done

mapfile -t TARBALLS < <(find "$OUT_ROOT/packages" -maxdepth 1 -type f -name '*.tgz' -print | sort)
[[ "${#TARBALLS[@]}" == "7" ]] || fail "Expected seven package tarballs; found ${#TARBALLS[@]}"
for tarball in "${TARBALLS[@]}"; do
	if tar -tzf "$tarball" | grep -Eiq '\.(node|exe|dll)$'; then
		fail "Package contains an uncertified native binary: $tarball"
	fi
done
sha256sum "${TARBALLS[@]}" > "$OUT_ROOT/SHA256SUMS"

log "Smoke-installing the exact seven-package set"
npm install --global --prefix "$(cygpath -w "$OUT_ROOT/smoke")" --ignore-scripts "${TARBALLS[@]}"
SMOKE_RECODE="$OUT_ROOT/smoke/recode.cmd"
SMOKE_PI="$OUT_ROOT/smoke/pi.cmd"
[[ -f "$SMOKE_RECODE" && -f "$SMOKE_PI" ]] || fail "Smoke-install command shims are missing"
"$SMOKE_RECODE" --version | grep -Fx "$VERSION" >/dev/null
"$SMOKE_RECODE" --help >/dev/null
"$SMOKE_RECODE" --offline --list-models >/dev/null
"$SMOKE_PI" --help >/dev/null

log "Installing the verified package set into $GLOBAL_PREFIX_WIN"
npm install --global --ignore-scripts "${TARBALLS[@]}"

MANIFEST="$GLOBAL_ROOT/@reitaard/recode-coding-agent/package.json"
[[ -f "$MANIFEST" ]] || fail "Installed Recode manifest is missing: $MANIFEST"
INSTALLED_VERSION="$(node -p "require(process.argv[1]).version" "$MANIFEST")"
[[ "$INSTALLED_VERSION" == "$VERSION" ]] || fail "Installed version is $INSTALLED_VERSION; expected $VERSION"
[[ ! -d "$GLOBAL_ROOT/@reitaard/repi-coding-agent" ]] || fail "Legacy RePi coding-agent package remains installed"

GLOBAL_RECODE="$GLOBAL_PREFIX/recode.cmd"
GLOBAL_PI="$GLOBAL_PREFIX/pi.cmd"
[[ -f "$GLOBAL_RECODE" && -f "$GLOBAL_PI" ]] || fail "Global command shims are missing"
"$GLOBAL_RECODE" --version | grep -Fx "$VERSION" >/dev/null
"$GLOBAL_RECODE" --help >/dev/null
"$GLOBAL_RECODE" --offline --list-models >/dev/null
"$GLOBAL_PI" --help >/dev/null

log "Installed @reitaard/recode-coding-agent@$VERSION"
log "Existing data remains at $AGENT_DIR_WIN"
if [[ -f "$BACKUP" ]]; then
	log "Rollback data backup: $BACKUP"
fi
log "Package evidence: $OUT_ROOT"
log "Open a new terminal, run 'recode', then run 'pi update' to update extensions."
