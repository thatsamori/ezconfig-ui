#!/usr/bin/env bash
# The instance's half of `bun run deploy <commit>`: scripts/deploy.ts sends this
# script over SSH and runs it as root with the full commit id.
#
# It fetches the commit from the public GitHub repo, then installs and builds it
# as the app user in a new release folder while the current release keeps
# serving. It then switches the `current` link, restarts the app, waits for it to
# answer (startup migrates the database first), and keeps the newest 3 releases.
# Rolling back is deploying an older commit.
set -euo pipefail

readonly REPO=https://github.com/amorijs/mordhau-ezconfig.git
readonly ROOT=/srv/ezconfig-platform
readonly APP_USER=ezconfig
readonly SERVICE=ezconfig-platform
readonly APP_URL=http://127.0.0.1:3000/
readonly KEEP=3

step() { printf '\n== %s (%d s)\n' "$1" "$SECONDS"; }

# A clean environment: nothing from the SSH session or root reaches the build.
as_app() { runuser -u "$APP_USER" -- env -i HOME="$ROOT" PATH=/usr/local/bin:/usr/bin:/bin LANG=C.UTF-8 NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 "$@"; }

main() {
  local commit=${1:-}
  [[ $commit =~ ^[0-9a-f]{40}$ ]] || { echo "usage: release.sh <full 40-character commit id>" >&2; return 2; }
  [[ $EUID -eq 0 ]] || { echo "release.sh runs as root" >&2; return 1; }

  exec 9>"$ROOT/.deploy.lock"
  flock -n 9 || { echo "another deploy is running" >&2; return 1; }

  release="$ROOT/releases/$(date -u +%Y%m%dT%H%M%SZ)-${commit:0:12}"
  switched=
  # A release that never went live is removed, whatever step failed.
  trap '[[ -n $switched ]] || rm -rf "$release"' EXIT

  step "Fetching $commit"
  as_app mkdir "$release"
  as_app git -C "$release" init -q
  as_app git -C "$release" fetch -q --depth 1 "$REPO" "$commit"
  as_app git -C "$release" -c advice.detachedHead=false checkout -q FETCH_HEAD
  [[ $(as_app git -C "$release" rev-parse HEAD) == "$commit" ]]

  step "Installing"
  (cd "$release" && as_app bun install --frozen-lockfile)

  step "Building"
  (cd "$release" && as_app bun --bun next build)

  step "Switching to $(basename "$release")"
  ln -sfn "$release" "$ROOT/current.next"
  mv -T "$ROOT/current.next" "$ROOT/current"
  switched=1
  systemctl restart "$SERVICE"

  step "Waiting for the app"
  local code=000
  for _ in $(seq 90); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$APP_URL" || true)
    [[ $code =~ ^[234] ]] && break
    sleep 1
  done
  if [[ ! $code =~ ^[234] ]]; then
    journalctl -u "$SERVICE" -n 40 --no-pager
    echo "The app did not answer (last status $code). current is $(basename "$release"); deploy the previous commit to roll back." >&2
    return 1
  fi
  echo "answered $code"

  step "Keeping the newest $KEEP releases"
  local live dir
  live=$(readlink -f "$ROOT/current")
  ls -1d "$ROOT"/releases/*/ | sort -r | tail -n +$((KEEP + 1)) | while read -r dir; do
    dir=${dir%/}
    [[ $dir == "$live" ]] || { rm -rf "$dir"; echo "removed $(basename "$dir")"; }
  done

  printf '\nDeployed %s in %d s\n' "$commit" "$SECONDS"
}

# Bash reads this script from stdin as it runs: main is read whole before it
# starts, and runs with stdin closed so no command can consume the script.
main "$@" </dev/null
