#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
	printf 'install-vps.sh: ERROR: %s\n' "$*" >&2
	exit 1
}

log() {
	printf 'install-vps.sh: %s\n' "$*"
}

[[ "$(uname -s)" == "Linux" ]] || fail "This installer supports Linux only"
[[ "$(id -u)" == "0" ]] || fail "Run as root so /usr/local/bin/recode and system services can be updated"

for command in git node npm tar sha256sum systemctl find readlink; do
	command -v "$command" >/dev/null 2>&1 || fail "Required command is missing: $command"
done

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "Run this script inside the Recode repository"
cd "$ROOT"
[[ "$(git branch --show-current)" == "main" ]] || fail "Current branch must be main"
[[ -z "$(git status --porcelain)" ]] || fail "Checkout is dirty; use a clean released checkout"

VERSION="$(node -p "require('./package.json').version")"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "Invalid package version: $VERSION"
node -e 'const [a,b,c]=process.versions.node.split(".").map(Number); if (a<22 || (a===22 && b<19)) process.exit(1)' \
	|| fail "Node >=22.19.0 is required; found $(node --version)"

COMMIT="$(git rev-parse HEAD)"
SHORT_COMMIT="$(git rev-parse --short HEAD)"
INSTALL_ROOT="${RECODE_INSTALL_ROOT:-$HOME/opt/recode}"
RUNTIME_ROOT="$INSTALL_ROOT/$VERSION-$SHORT_COMMIT"
RUNTIME_PREFIX="$RUNTIME_ROOT/node-runtime"
BUILD_ROOT="$INSTALL_ROOT/build-$SHORT_COMMIT"
ROLLBACK_ROOT="$INSTALL_ROOT/rollback"
AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
GLOBAL_COMMAND="/usr/local/bin/recode"
GLOBAL_PI_COMMAND="/usr/local/bin/pi"
NEW_COMMAND="$RUNTIME_PREFIX/bin/recode"
NEW_PI_COMMAND="$RUNTIME_PREFIX/bin/pi"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ROLLBACK="$ROLLBACK_ROOT/$STAMP-before-$VERSION-$SHORT_COMMIT"
TELEGRAM_UNIT="recode-telegram.service"
MAESTRO_UNIT="recode-maestro.service"

case "$INSTALL_ROOT" in
	"$HOME"/opt/recode|/opt/recode) ;;
	*) fail "RECODE_INSTALL_ROOT must be $HOME/opt/recode or /opt/recode; got $INSTALL_ROOT" ;;
esac

if [[ "${1:-}" == "--check" ]]; then
	[[ "$#" == "1" ]] || fail "--check does not accept additional arguments"
	log "Preflight passed for Recode $VERSION at commit $COMMIT"
	log "Planned runtime: $RUNTIME_ROOT"
	log "Agent data: $AGENT_DIR"
	exit 0
fi
[[ "$#" == "0" ]] || fail "Unknown argument: $1"

install -d -m 0755 "$INSTALL_ROOT" "$RUNTIME_PREFIX" "$BUILD_ROOT/packages"
install -d -m 0700 "$ROLLBACK_ROOT" "$ROLLBACK"

cleanup_build() {
	rm -rf -- "$BUILD_ROOT/source"
}
trap cleanup_build EXIT

rm -rf -- "$BUILD_ROOT/source"
git clone --quiet --no-checkout "$ROOT" "$BUILD_ROOT/source"
git -C "$BUILD_ROOT/source" checkout --quiet --detach "$COMMIT"

log "Certifying source commit $COMMIT"
(
	cd "$BUILD_ROOT/source"
	npm ci --ignore-scripts --no-audit --no-fund
	npm run build
	npm run check
)

find "$BUILD_ROOT/packages" -mindepth 1 -maxdepth 1 -type f -name '*.tgz' -delete
for package_dir in telemetry ai agent storage/sqlite-node tui coding-agent orchestrator; do
	npm pack --ignore-scripts --pack-destination "$BUILD_ROOT/packages" "$BUILD_ROOT/source/packages/$package_dir" >/dev/null
done
mapfile -t TARBALLS < <(find "$BUILD_ROOT/packages" -maxdepth 1 -type f -name '*.tgz' -print | sort)
[[ "${#TARBALLS[@]}" == "7" ]] || fail "Expected seven package tarballs; found ${#TARBALLS[@]}"
sha256sum "${TARBALLS[@]}" > "$BUILD_ROOT/SHA256SUMS"

log "Installing the certified package set at $RUNTIME_PREFIX"
npm install --global --prefix "$RUNTIME_PREFIX" --ignore-scripts --no-audit --no-fund "${TARBALLS[@]}"
[[ -x "$NEW_COMMAND" ]] || fail "Installed Recode command is missing: $NEW_COMMAND"
[[ -x "$NEW_PI_COMMAND" ]] || fail "Installed Pi compatibility command is missing: $NEW_PI_COMMAND"
[[ "$("$NEW_COMMAND" --version)" == "$VERSION" ]] || fail "Staged Recode version check failed"
[[ "$("$NEW_PI_COMMAND" --version)" == "$VERSION" ]] || fail "Staged Pi version check failed"
"$NEW_COMMAND" --help >/dev/null
"$NEW_COMMAND" --offline --list-models >/dev/null

TELEGRAM_WAS_ACTIVE=false
MAESTRO_WAS_INSTALLED=false
[[ "$(systemctl is-active "$TELEGRAM_UNIT" 2>/dev/null || true)" == "active" ]] && TELEGRAM_WAS_ACTIVE=true
[[ -f "$HOME/.config/systemd/user/$MAESTRO_UNIT" ]] && MAESTRO_WAS_INSTALLED=true

if [[ -e "$GLOBAL_COMMAND" || -L "$GLOBAL_COMMAND" ]]; then
	cp -a -- "$GLOBAL_COMMAND" "$ROLLBACK/recode.command"
fi
if [[ -e "$GLOBAL_PI_COMMAND" || -L "$GLOBAL_PI_COMMAND" ]]; then
	cp -a -- "$GLOBAL_PI_COMMAND" "$ROLLBACK/pi.command"
fi
[[ -f /etc/systemd/system/$TELEGRAM_UNIT ]] && cp -a -- "/etc/systemd/system/$TELEGRAM_UNIT" "$ROLLBACK/"
[[ -d /etc/systemd/system/$TELEGRAM_UNIT.d ]] && cp -a -- "/etc/systemd/system/$TELEGRAM_UNIT.d" "$ROLLBACK/"
[[ -f "$HOME/.config/systemd/user/$MAESTRO_UNIT" ]] && cp -a -- "$HOME/.config/systemd/user/$MAESTRO_UNIT" "$ROLLBACK/"

rollback_install() {
	local status=$?
	trap - ERR
	log "Installation failed; restoring the previous command and services"
	if [[ -e "$ROLLBACK/recode.command" || -L "$ROLLBACK/recode.command" ]]; then
		cp -a --remove-destination -- "$ROLLBACK/recode.command" "$GLOBAL_COMMAND"
	else
		rm -f -- "$GLOBAL_COMMAND"
	fi
	if [[ -e "$ROLLBACK/pi.command" || -L "$ROLLBACK/pi.command" ]]; then
		cp -a --remove-destination -- "$ROLLBACK/pi.command" "$GLOBAL_PI_COMMAND"
	else
		rm -f -- "$GLOBAL_PI_COMMAND"
	fi
	systemctl daemon-reload || true
	$TELEGRAM_WAS_ACTIVE && systemctl restart "$TELEGRAM_UNIT" || true
	if $MAESTRO_WAS_INSTALLED && [[ -f "$ROLLBACK/$MAESTRO_UNIT" ]]; then
		cp -a -- "$ROLLBACK/$MAESTRO_UNIT" "$HOME/.config/systemd/user/$MAESTRO_UNIT"
		systemctl --user daemon-reload || true
		systemctl --user restart "$MAESTRO_UNIT" || true
	fi
	exit "$status"
}
trap rollback_install ERR

$TELEGRAM_WAS_ACTIVE && systemctl stop "$TELEGRAM_UNIT"
if [[ -d "$AGENT_DIR" ]]; then
	log "Backing up $AGENT_DIR"
	tar -C "$(dirname "$AGENT_DIR")" -czf "$ROLLBACK/agent.tar.gz" "$(basename "$AGENT_DIR")"
	[[ -s "$ROLLBACK/agent.tar.gz" ]] || fail "Agent-data backup was not created"
	tar -tzf "$ROLLBACK/agent.tar.gz" >/dev/null
	sha256sum "$ROLLBACK/agent.tar.gz" > "$ROLLBACK/agent.tar.gz.sha256"
fi

ln -s "$NEW_COMMAND" "$GLOBAL_COMMAND.next"
mv -Tf "$GLOBAL_COMMAND.next" "$GLOBAL_COMMAND"
ln -s "$NEW_PI_COMMAND" "$GLOBAL_PI_COMMAND.next"
mv -Tf "$GLOBAL_PI_COMMAND.next" "$GLOBAL_PI_COMMAND"
[[ "$("$GLOBAL_COMMAND" --version)" == "$VERSION" ]] || fail "Global Recode version check failed"
[[ "$("$GLOBAL_PI_COMMAND" --version)" == "$VERSION" ]] || fail "Global Pi version check failed"

if $MAESTRO_WAS_INSTALLED; then
	"$GLOBAL_COMMAND" maestro service install
fi
if $TELEGRAM_WAS_ACTIVE; then
	systemctl restart "$TELEGRAM_UNIT"
	for _ in $(seq 1 30); do
		[[ "$(systemctl is-active "$TELEGRAM_UNIT" 2>/dev/null || true)" == "active" ]] && break
		sleep 1
	done
	[[ "$(systemctl is-active "$TELEGRAM_UNIT")" == "active" ]] || fail "$TELEGRAM_UNIT did not become active"
fi

trap - ERR
find "$ROLLBACK_ROOT" -mindepth 1 -maxdepth 1 -type d ! -path "$ROLLBACK" -exec rm -rf -- {} +

log "Installed Recode $VERSION at $RUNTIME_ROOT"
log "Global command: $GLOBAL_COMMAND"
log "Agent data remains at $AGENT_DIR"
log "Rollback backup: $ROLLBACK"
