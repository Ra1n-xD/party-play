#!/bin/bash
set -Eeuo pipefail

# Keep the default lock shared with older workflows during the rename.
deploy_lock="${PARTYSIDE_DEPLOY_LOCK:-${PARTYPLAY_DEPLOY_LOCK:-/tmp/partyplay-deploy.lock}}"
health_url="${PARTYSIDE_HEALTH_URL:-${PARTYPLAY_HEALTH_URL:-http://127.0.0.1:3001/readyz}}"
deploy_url="${PARTYSIDE_DEPLOY_URL:-${PARTYPLAY_DEPLOY_URL:-http://127.0.0.1:3001/deployz}}"
target_commit="${PARTYSIDE_TARGET_COMMIT:-${PARTYPLAY_TARGET_COMMIT:-}}"
configured_project_dir="${PARTYSIDE_PROJECT_DIR:-${PARTYPLAY_PROJECT_DIR:-}}"
service_name="${PARTYSIDE_SERVICE:-${PARTYPLAY_SERVICE:-}}"
previous_commit=""
project_dir=""
backup_dir=""
release_mutated=false
rollback_snapshot_ready=false
service_restart_attempted=false
deployment_complete=false
exit_handler_running=false
deployment_draining=false
legacy_deploy_endpoint=false

exec 9>"$deploy_lock"
if ! flock -w 600 9; then
  echo "ERROR: another PartySide deployment is still running" >&2
  exit 1
fi

if [ -z "$configured_project_dir" ]; then
  if [ -d "$HOME/party-side/.git" ]; then
    configured_project_dir="$HOME/party-side"
  else
    configured_project_dir="$HOME/party-play"
  fi
fi
cd -- "$configured_project_dir"
if [ -z "$service_name" ]; then
  if [ "$(systemctl show partyside --property=LoadState --value)" = "loaded" ]; then
    service_name=partyside
  else
    service_name=partyplay
  fi
fi
if [[ ! "$service_name" =~ ^[a-zA-Z0-9_.@-]+$ ]]; then
  echo "ERROR: invalid service name" >&2
  exit 1
fi
project_dir=$(pwd -P)
if [ -z "$project_dir" ] || [ "$project_dir" = "/" ]; then
  echo "ERROR: unsafe PartySide project directory" >&2
  exit 1
fi

wait_for_readiness() {
  local attempt=1
  until curl --fail --silent --show-error --connect-timeout 2 --max-time 3 "$health_url" >/dev/null; do
    if [ "$attempt" -ge 15 ]; then
      return 1
    fi
    sleep 1
    attempt=$((attempt + 1))
  done
}

enter_deployment_drain() {
  local response_file
  local status
  response_file=$(mktemp)
  if ! status=$(
    curl --silent --show-error --connect-timeout 2 --max-time 3 \
      --request POST --output "$response_file" --write-out "%{http_code}" \
      "$deploy_url/drain"
  ); then
    rm -f "$response_file"
    echo "ERROR: cannot reach PartySide deployment gate" >&2
    return 1
  fi

  case "$status" in
    200)
      deployment_draining=true
      echo "Deployment gate closed: no rooms can start during the update."
      ;;
    409)
      echo "ERROR: deployment postponed because a room is still retained:" >&2
      cat "$response_file" >&2
      echo >&2
      rm -f "$response_file"
      return 1
      ;;
    404)
      if [ "${PARTYSIDE_ALLOW_LEGACY_DEPLOY:-${PARTYPLAY_ALLOW_LEGACY_DEPLOY:-0}}" != "1" ]; then
        echo "ERROR: installed server does not expose the deployment gate" >&2
        echo "ERROR: the first bootstrap requires explicit PARTYSIDE_ALLOW_LEGACY_DEPLOY=1" >&2
        rm -f "$response_file"
        return 1
      fi
      legacy_deploy_endpoint=true
      echo "WARNING: explicit legacy bootstrap enabled without a deployment gate." >&2
      echo "WARNING: continue only after confirming that nobody is playing." >&2
      ;;
    *)
      echo "ERROR: deployment gate returned HTTP $status:" >&2
      cat "$response_file" >&2
      echo >&2
      rm -f "$response_file"
      return 1
      ;;
  esac
  rm -f "$response_file"
}

verify_deployment_drain() {
  if [ "$legacy_deploy_endpoint" = true ]; then
    return 0
  fi
  if ! curl --fail --silent --show-error --connect-timeout 2 --max-time 3 "$deploy_url" >/dev/null; then
    echo "ERROR: a room appeared while preparing the release" >&2
    return 1
  fi
}

resume_deployment_gate() {
  if [ "$deployment_draining" != true ]; then
    return 0
  fi
  if curl --fail --silent --show-error --connect-timeout 2 --max-time 3 \
    --request POST "$deploy_url/resume" >/dev/null; then
    deployment_draining=false
    return 0
  fi
  echo "CRITICAL: failed to reopen the deployment gate" >&2
  return 1
}

safe_remove_release_path() {
  local path=$1
  case "$path" in
    "$project_dir/node_modules" | "$project_dir/server/dist" | "$project_dir/client/dist" | "$backup_dir")
      rm -rf -- "$path"
      ;;
    *)
      echo "ERROR: refused to remove unsafe release path: $path" >&2
      return 1
      ;;
  esac
}

prepare_rollback_snapshot() {
  if [ ! -d "$project_dir/node_modules" ]; then
    echo "ERROR: node_modules is missing; cannot prepare a safe rollback" >&2
    return 1
  fi
  if [ ! -f "$project_dir/server/dist/server/src/index.js" ]; then
    echo "ERROR: current server artifact is missing; cannot prepare a safe rollback" >&2
    return 1
  fi
  if [ ! -f "$project_dir/client/dist/index.html" ]; then
    echo "ERROR: current client artifact is missing; cannot prepare a safe rollback" >&2
    return 1
  fi

  backup_dir=$(mktemp -d "$project_dir/.deploy-backup.XXXXXX")
  cp -a "$project_dir/server/dist" "$backup_dir/server-dist"
  cp -a "$project_dir/client/dist" "$backup_dir/client-dist"
  rollback_snapshot_ready=true
  release_mutated=true
  mv "$project_dir/node_modules" "$backup_dir/node_modules"
}

restore_previous_release() {
  local restore_status=0

  if [ "$release_mutated" != true ]; then
    return 0
  fi
  if [ "$rollback_snapshot_ready" != true ] || [ -z "$previous_commit" ] || \
    [ -z "$backup_dir" ] || [ ! -d "$backup_dir" ]; then
    echo "CRITICAL: rollback snapshot is incomplete; the running service was not restarted." >&2
    return 1
  fi

  echo "Deployment failed. Restoring immutable snapshot for $previous_commit..." >&2
  if ! git reset --hard "$previous_commit"; then
    echo "CRITICAL: checkout rollback failed; snapshot preserved at $backup_dir" >&2
    return 1
  fi

  if [ -d "$backup_dir/node_modules" ]; then
    if safe_remove_release_path "$project_dir/node_modules"; then
      cp -a "$backup_dir/node_modules" "$project_dir/node_modules" || restore_status=1
    else
      restore_status=1
    fi
  else
    echo "CRITICAL: dependency snapshot is missing" >&2
    restore_status=1
  fi

  if [ -d "$backup_dir/server-dist" ]; then
    if safe_remove_release_path "$project_dir/server/dist"; then
      cp -a "$backup_dir/server-dist" "$project_dir/server/dist" || restore_status=1
    else
      restore_status=1
    fi
  else
    echo "CRITICAL: server artifact snapshot is missing" >&2
    restore_status=1
  fi

  if [ -d "$backup_dir/client-dist" ]; then
    if safe_remove_release_path "$project_dir/client/dist"; then
      cp -a "$backup_dir/client-dist" "$project_dir/client/dist" || restore_status=1
    else
      restore_status=1
    fi
  else
    echo "CRITICAL: client artifact snapshot is missing" >&2
    restore_status=1
  fi

  if [ "$restore_status" -ne 0 ]; then
    echo "CRITICAL: snapshot restoration failed; backup preserved at $backup_dir" >&2
    return 1
  fi

  release_mutated=false
  rollback_snapshot_ready=false
  return 0
}

cleanup_rollback_snapshot() {
  if [ -z "$backup_dir" ] || [ ! -d "$backup_dir" ]; then
    return
  fi
  if ! safe_remove_release_path "$backup_dir"; then
    echo "WARNING: release backup remains at $backup_dir" >&2
  fi
}

handle_exit() {
  local failure_status=$?
  local recovery_required=false
  local restore_status=0
  trap - EXIT
  trap '' HUP INT TERM
  set +e

  if [ "$exit_handler_running" = true ]; then
    exit "$failure_status"
  fi
  exit_handler_running=true

  if [ "$deployment_complete" = true ]; then
    cleanup_rollback_snapshot
    exit "$failure_status"
  fi
  if [ "$release_mutated" = true ] || [ "$deployment_draining" = true ] || \
    [ "$service_restart_attempted" = true ]; then
    recovery_required=true
  fi
  if [ "$recovery_required" != true ]; then
    cleanup_rollback_snapshot
    exit "$failure_status"
  fi
  if [ "$failure_status" -eq 0 ]; then
    failure_status=1
  fi

  restore_previous_release || restore_status=1

  if [ "$service_restart_attempted" = true ]; then
    if [ "$restore_status" -eq 0 ]; then
      if sudo systemctl restart "$service_name" && systemctl is-active --quiet "$service_name"; then
        deployment_draining=false
      else
        restore_status=1
        resume_deployment_gate || true
      fi
    else
      resume_deployment_gate || true
    fi
  else
    resume_deployment_gate || restore_status=1
  fi

  if [ "$restore_status" -eq 0 ]; then
    wait_for_readiness || restore_status=1
  fi

  if [ "$restore_status" -eq 0 ]; then
    cleanup_rollback_snapshot
    echo "Previous release restored successfully." >&2
  else
    echo "CRITICAL: automatic rollback failed; inspect $service_name.service and $backup_dir." >&2
  fi
  exit "$failure_status"
}

trap handle_exit EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

worktree_status=$(git status --porcelain --untracked-files=all)
if [ -n "$worktree_status" ]; then
  echo "ERROR: production checkout contains local changes" >&2
  printf '%s\n' "$worktree_status" >&2
  exit 1
fi
existing_backup=$(find "$project_dir" -maxdepth 1 -type d -name '.deploy-backup.*' -print -quit)
if [ -n "$existing_backup" ]; then
  echo "ERROR: unfinished deployment backup found at $existing_backup" >&2
  echo "ERROR: inspect or restore it before starting another deployment" >&2
  exit 1
fi

enter_deployment_drain
previous_commit=$(git rev-parse HEAD)
prepare_rollback_snapshot

echo "Pulling latest changes..."
git pull --ff-only origin main

if [ -n "$target_commit" ] && [ "$(git rev-parse HEAD)" != "$target_commit" ]; then
  echo "ERROR: main moved past the workflow commit; a newer deployment will handle it" >&2
  false
fi

echo "Installing dependencies..."
npm ci --include=dev

echo "Building project..."
npm run build

if [ ! -f server/dist/server/src/index.js ]; then
  echo "ERROR: server build failed — server/dist/server/src/index.js not found" >&2
  false
fi

if [ ! -f client/dist/index.html ]; then
  echo "ERROR: client build failed — client/dist/index.html not found" >&2
  false
fi

verify_deployment_drain

echo "Build successful. Restarting service..."
service_restart_attempted=true
sudo systemctl restart "$service_name"
systemctl is-active --quiet "$service_name"

if ! wait_for_readiness; then
  echo "ERROR: PartySide readiness check failed: $health_url" >&2
  false
fi

deployment_complete=true
release_mutated=false
rollback_snapshot_ready=false
service_restart_attempted=false
deployment_draining=false
cleanup_rollback_snapshot

echo "Deploy complete."
systemctl status "$service_name" --no-pager || true
