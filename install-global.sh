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

retry_cleanup_npm_staging() {
	local package_root="$1"
	local leftovers directory attempt
	[[ -d "$package_root" ]] || return 0

	for attempt in 1 2 3 4 5; do
		leftovers="$(find "$package_root" -mindepth 1 -maxdepth 1 -type d -name '.recode-*' -print 2>/dev/null || true)"
		[[ -z "$leftovers" ]] && return 0
		while IFS= read -r directory; do
			[[ -n "$directory" ]] || continue
			rm -rf "$directory" 2>/dev/null || true
		done <<< "$leftovers"
		if (( attempt < 5 )); then sleep 1; fi
	done

	leftovers="$(find "$package_root" -mindepth 1 -maxdepth 1 -type d -name '.recode-*' -print 2>/dev/null || true)"
	while IFS= read -r directory; do
		[[ -n "$directory" ]] || continue
		log "Could not remove temporary npm staging directory: $directory"
		log "Close Node/Recode processes or release antivirus locks, then remove it manually."
	done <<< "$leftovers"
	[[ -z "$leftovers" ]]
}

get_recode_processes() {
	powershell.exe -NoProfile -NonInteractive -Command '$ids = @(Get-CimInstance Win32_Process | Where-Object { ($_.Name -in @("recode.exe", "recode-maestro.exe")) -or ($_.Name -in @("node.exe", "nodejs.exe") -and $_.CommandLine -and $_.CommandLine -match "recode-coding-agent|recode-orchestrator|recode-maestro|recode\.cmd|recode-maestro\.cmd|pi\.cmd") } | ForEach-Object { $_.ProcessId }); $ids | Sort-Object -Unique' 2>/dev/null | tr -d '\r' || true
}

request_recode_process_shutdown() {
	local processes answer pid remaining attempt
	processes="$(get_recode_processes)"
	[[ -z "$processes" ]] && return 0
	if [[ ! -t 0 ]]; then
		fail "Recode/Node processes are running (PIDs: $(tr '\n' ' ' <<< "$processes")); interactive confirmation is required to close them."
	fi

	printf 'install-global.sh: Recode/Node processes are running (PIDs: %s)\n' "$(tr '\n' ' ' <<< "$processes")"
	printf 'install-global.sh: This may discard unsaved work. Force close these processes and continue? [y/N] '
	IFS= read -r answer || fail "Could not read the shutdown confirmation."
	case "$answer" in
		y|Y|yes|YES|Yes)
			while IFS= read -r pid; do
				[[ "$pid" =~ ^[0-9]+$ ]] || continue
				log "Force-closing PID $pid"
				if ! MSYS_NO_PATHCONV=1 taskkill.exe /PID "$pid" /T /F >/dev/null 2>&1; then
					log "Windows could not submit the force-close request for PID $pid."
				fi
			done <<< "$processes"
			for attempt in 1 2 3 4 5 6 7 8 9 10; do
				remaining="$(get_recode_processes)"
				[[ -z "$remaining" ]] && return 0
				sleep 1
			done
			fail "Some Recode/Node processes survived force termination (PIDs: $(tr '\n' ' ' <<< "$remaining")). Close them manually before rerunning."
			;;
		*)
			fail "Installation cancelled; running Recode/Node processes were not closed."
			;;
	esac
}

install_smoke_packages() {
	local log_path="$OUT_ROOT/smoke-install.log"
	local status
	npm install --global --prefix "$(cygpath -w "$OUT_ROOT/smoke")" --ignore-scripts --no-audit --no-fund --loglevel=error "${TARBALLS[@]}" >"$log_path" 2>&1 && {
		rm -f "$log_path"
		return 0
	}
	status=$?
	cat "$log_path" >&2
	rm -f "$log_path"
	return "$status"
}

install_verified_global_packages() {
	local log_path="$OUT_ROOT/global-install.log"
	local status attempt
	for attempt in 1 2 3; do
		npm install --global --ignore-scripts --no-audit --no-fund --loglevel=error "${TARBALLS[@]}" >"$log_path" 2>&1 && {
			rm -f "$log_path"
			return 0
		}
		status=$?
		if grep -Eiq 'EBUSY|EPERM|resource busy|locked' "$log_path" && (( attempt < 3 )); then
			log "Global npm install hit a Windows file lock; retrying ($((attempt + 1))/3)"
			if ! retry_cleanup_npm_staging "$GLOBAL_ROOT/@reitaard"; then
				log "A temporary npm staging directory is still locked; retrying anyway."
			fi
			sleep 2
			continue
		fi
		cat "$log_path" >&2
		rm -f "$log_path"
		return "$status"
	done
	return 1
}

remove_stale_legacy_shims() {
	local command shim_win shim legacy_package
	for command in recode pi; do
		while IFS= read -r shim_win; do
			[[ -n "$shim_win" ]] || continue
			shim="$(cygpath -u "$shim_win")"
			[[ -f "$shim" ]] || continue
			if grep -Fq '@reitaard\repi-coding-agent\dist\' "$shim" ||
				grep -Fq '@reitaard/repi-coding-agent/dist/' "$shim"; then
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

for command in git node npm cygpath tar sha256sum powershell.exe taskkill.exe; do
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

request_recode_process_shutdown
if ! retry_cleanup_npm_staging "$GLOBAL_ROOT/@reitaard"; then
	fail "A previous npm staging directory is still locked. Close Node/Recode processes and rerun."
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

OUT_ROOT="${TEMP:-${TMPDIR:-/tmp}}/recode-global-$VERSION-$(git rev-parse --short HEAD)"
OUT_ROOT="$(cygpath -u "$OUT_ROOT" 2>/dev/null || printf '%s' "$OUT_ROOT")"
CERT_ROOT="$OUT_ROOT/source"
rm -rf "$OUT_ROOT"
mkdir -p "$OUT_ROOT/packages" "$OUT_ROOT/smoke"

cleanup_certification_checkout() {
	rm -rf "$CERT_ROOT"
}
trap cleanup_certification_checkout EXIT

# Clear registrations left by older installer attempts; the current flow uses a clone instead.
git -C "$ROOT" worktree prune
rm -rf "$CERT_ROOT"
git clone --quiet --no-checkout "$ROOT" "$CERT_ROOT"
git -C "$CERT_ROOT" checkout --quiet --detach "$COMMIT"

PACKAGE_DIRS=(
	packages/telemetry
	packages/ai
	packages/agent
	packages/storage/sqlite-node
	packages/tui
	packages/coding-agent
	packages/orchestrator
)
log "Certifying source commit $COMMIT in an isolated worktree"
(
	cd "$CERT_ROOT"
	npm ci --ignore-scripts --no-audit --no-fund
	npm run build
	npm run check
	PACK_LOG="$OUT_ROOT/npm-pack.log"
	for package_dir in "${PACKAGE_DIRS[@]}"; do
		if ! (cd "$package_dir" && npm pack --ignore-scripts --pack-destination "$OUT_ROOT/packages" >"$PACK_LOG" 2>&1); then
			cat "$PACK_LOG" >&2
			fail "npm pack failed for $package_dir"
		fi
	done
	rm -f "$PACK_LOG"
)
cleanup_certification_checkout
trap - EXIT

mapfile -t TARBALLS < <(find "$OUT_ROOT/packages" -maxdepth 1 -type f -name '*.tgz' -print | sort)
[[ "${#TARBALLS[@]}" == "7" ]] || fail "Expected seven package tarballs; found ${#TARBALLS[@]}"
for tarball in "${TARBALLS[@]}"; do
	if tar -tzf "$tarball" | grep -Eiq '\.(node|exe|dll)$'; then
		fail "Package contains an uncertified native binary: $tarball"
	fi
done
sha256sum "${TARBALLS[@]}" > "$OUT_ROOT/SHA256SUMS"

log "Smoke-installing the exact seven-package set"
install_smoke_packages
if ! retry_cleanup_npm_staging "$OUT_ROOT/smoke/node_modules/@reitaard"; then
	log "Smoke-install cleanup left a temporary directory; continuing because the isolated install succeeded."
fi
SMOKE_RECODE="$OUT_ROOT/smoke/recode.cmd"
SMOKE_PI="$OUT_ROOT/smoke/pi.cmd"
[[ -f "$SMOKE_RECODE" && -f "$SMOKE_PI" ]] || fail "Smoke-install command shims are missing"
"$SMOKE_RECODE" --version | grep -Fx "$VERSION" >/dev/null
"$SMOKE_RECODE" --help >/dev/null
"$SMOKE_RECODE" --offline --list-models >/dev/null
"$SMOKE_PI" --help >/dev/null

if [[ -d "$GLOBAL_ROOT/@reitaard/repi-coding-agent" ]]; then
	log "Removing the previous global coding-agent package after certification and smoke installation"
	npm uninstall --global --ignore-scripts --no-audit --no-fund --loglevel=error @reitaard/repi-coding-agent
fi
remove_stale_legacy_shims

log "Installing the verified package set into $GLOBAL_PREFIX_WIN"
install_verified_global_packages
if ! retry_cleanup_npm_staging "$GLOBAL_ROOT/@reitaard"; then
	log "Global install completed, but a temporary npm staging directory remains locked."
fi

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
