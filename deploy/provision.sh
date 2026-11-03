#!/usr/bin/env bash
# Sets up the platform instance (Lightsail, Ubuntu 24.04 LTS, x86_64), and can
# be run again after any file in this folder changes. From the owner's PC, with
# the instance reachable as the SSH alias ezconfig-platform (docs/hosting.md):
#   scp -r deploy ezconfig-platform:ezconfig-deploy
#   ssh ezconfig-platform sudo bash ezconfig-deploy/provision.sh
#
# It installs Bun and Litestream at pinned versions (checked against their
# release checksums) and Caddy from Caddy's apt repository, creates the app user
# and folders, and installs the units, config files and the weekly restore
# check from this folder. It
# never writes the instance's settings: /etc/ezconfig-platform/platform.env,
# /etc/ezconfig-platform/caddy.env and /etc/litestream.yml. It creates them empty
# and root-only when missing, and keeps them root-only.
set -euo pipefail

readonly BUN_VERSION=1.3.14
readonly LITESTREAM_VERSION=0.5.17 # 0.5.x, at least 0.5.12
readonly APP_USER=ezconfig
readonly ROOT=/srv/ezconfig-platform
readonly DATA=/var/lib/ezconfig-platform
readonly SETTINGS=/etc/ezconfig-platform
readonly CHECK=/usr/local/lib/ezconfig-platform

here=$(cd "$(dirname "$0")" && pwd)
step() { printf '\n== %s\n' "$*"; }

[[ $EUID -eq 0 ]] || { echo "provision.sh runs as root (sudo)" >&2; exit 1; }
. /etc/os-release
[[ "$ID $VERSION_ID $(uname -m)" == "ubuntu 24.04 x86_64" ]] || { echo "expected Ubuntu 24.04 on x86_64, found $PRETTY_NAME on $(uname -m)" >&2; exit 1; }

# Downloads $1 into $2 and checks it against the checksums file at $3.
fetch_checked() {
  local url=$1 dir=$2 sums=$3 name=${1##*/}
  curl -fsSL -o "$dir/$name" "$url"
  curl -fsSL -o "$dir/sums.txt" "$sums"
  (cd "$dir" && grep -E "[[:space:]]\*?$name\$" sums.txt | sha256sum -c -)
}

step "Clock: UTC (the reboot time for upgrades is local time)"
timedatectl set-timezone Etc/UTC

step "Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q ca-certificates curl git gnupg sqlite3 unattended-upgrades unzip debian-keyring debian-archive-keyring apt-transport-https

step "Swap: 2 GB, so a build fits beside the running app"
if [[ -z $(swapon --show --noheadings) ]]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

step "Caddy"
if [[ ! -f /usr/share/keyrings/caddy-stable-archive-keyring.gpg ]]; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
fi
apt-get install -y -q caddy

step "Bun $BUN_VERSION"
if [[ $(/usr/local/bin/bun --version 2>/dev/null || true) != "$BUN_VERSION" ]]; then
  tmp=$(mktemp -d)
  build=bun-linux-x64
  grep -qw avx2 /proc/cpuinfo || build=bun-linux-x64-baseline
  base=https://github.com/oven-sh/bun/releases/download/bun-v$BUN_VERSION
  fetch_checked "$base/$build.zip" "$tmp" "$base/SHASUMS256.txt"
  unzip -q "$tmp/$build.zip" -d "$tmp"
  install -m 755 "$tmp/$build/bun" /usr/local/bin/bun
  rm -rf "$tmp"
fi
/usr/local/bin/bun --version

step "Litestream $LITESTREAM_VERSION"
if [[ $(/usr/local/bin/litestream version 2>/dev/null || true) != *"$LITESTREAM_VERSION"* ]]; then
  tmp=$(mktemp -d)
  base=https://github.com/benbjohnson/litestream/releases/download/v$LITESTREAM_VERSION
  fetch_checked "$base/litestream-$LITESTREAM_VERSION-linux-x86_64.tar.gz" "$tmp" "$base/checksums.txt"
  tar -xzf "$tmp/litestream-$LITESTREAM_VERSION-linux-x86_64.tar.gz" -C "$tmp" litestream
  install -m 755 "$tmp/litestream" /usr/local/bin/litestream
  rm -rf "$tmp"
fi
/usr/local/bin/litestream version

step "App user and folders"
id "$APP_USER" &>/dev/null || useradd --system --home-dir "$ROOT" --shell /usr/sbin/nologin "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 755 "$ROOT" "$ROOT/releases"
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$DATA"
install -d -o root -g root -m 755 "$SETTINGS"

step "Instance settings: created empty when missing, kept root-only, never written"
for file in "$SETTINGS/platform.env" "$SETTINGS/caddy.env" /etc/litestream.yml; do
  [[ -e $file ]] || install -o root -g root -m 600 /dev/null "$file"
  chown root:root "$file"
  chmod 600 "$file"
done

step "Units, config files and the restore check"
install -m 644 "$here/ezconfig-platform.service" "$here/litestream.service" "$here/ezconfig-restore-check.service" "$here/ezconfig-restore-check.timer" /etc/systemd/system/
install -d -m 755 "$CHECK"
install -m 644 "$here/restore-check.ts" "$CHECK/restore-check.ts"
install -d /etc/systemd/system/caddy.service.d /etc/systemd/journald.conf.d
install -m 644 "$here/caddy.service.conf" /etc/systemd/system/caddy.service.d/ezconfig-platform.conf
install -m 644 "$here/Caddyfile" /etc/caddy/Caddyfile
install -m 644 "$here/journald.conf" /etc/systemd/journald.conf.d/ezconfig-platform.conf
install -m 644 "$here/unattended-upgrades.conf" /etc/apt/apt.conf.d/52ezconfig-platform
systemctl daemon-reload
systemctl restart systemd-journald
systemctl enable ezconfig-platform.service litestream.service caddy.service ezconfig-restore-check.timer

step "Starting what is configured"
if [[ -s $SETTINGS/caddy.env ]]; then
  (set -a && . "$SETTINGS/caddy.env" && caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile)
  systemctl restart caddy
else
  # The package starts Caddy with its own welcome page; keep it off until filled.
  systemctl stop caddy
  echo "Caddy: fill $SETTINGS/caddy.env (.env.example), then run this again."
fi
if [[ -s /etc/litestream.yml ]]; then
  systemctl restart litestream
else
  echo "Litestream: fill /etc/litestream.yml from deploy/litestream.yml.example, then run this again."
fi
# The timer always runs; the check skips itself until /etc/litestream.yml is
# filled. Restarting it picks up a changed schedule.
systemctl restart ezconfig-restore-check.timer
systemctl list-timers ezconfig-restore-check.timer --no-pager
if [[ -e $ROOT/current ]]; then
  systemctl restart ezconfig-platform
else
  echo "App: fill $SETTINGS/platform.env (.env.example), then run bun run deploy <commit> from the PC."
fi

printf '\nProvisioned.\n'
