#!/usr/bin/env bash
# Fixed local equivalents of the native workflow steps; no production credentials.
set -euo pipefail
trap 'exit 143' TERM
trap 'exit 130' INT
cd "$(dirname "$0")/.."
mode="${1:?Choose a fixed validation gate}"
test "$(uname -s)" = Linux

require_fresh_stack() {
  # Refuse existing TurnRight state, without touching unrelated Docker workloads.
  test ! -e .local-runtime/services.json
  test ! -e .local-runtime/accounts.json
  test -z "$(docker ps -aq --filter label=com.supabase.cli.project=turnright-local)"
  test -z "$(docker volume ls -q --filter label=com.supabase.cli.project=turnright-local)"
  test -z "$(docker ps -a --format '{{.Names}}' | grep -E '^supabase_.*_turnright-local$' || true)"
  test -z "$(docker volume ls --format '{{.Name}}' | grep -E '^supabase_.*_turnright-local$' || true)"
  node --input-type=module -e 'import net from "node:net"; for (const port of [5180,54320,54321,54322]) await new Promise((resolve,reject)=>{const server=net.createServer(); server.once("error",reject); server.listen(port,"127.0.0.1",()=>server.close(resolve));});'
}

case "$mode" in
  setup)
    require_fresh_stack
    test "$(gitleaks version)" = 8.30.1
    python3 -m venv .local-runtime/manual-python
    .local-runtime/manual-python/bin/python -m pip install --require-hashes -r scripts/requirements-quality.lock -r scripts/requirements-test.lock -r scripts/requirements-data.lock
    npm exec -- playwright install --with-deps chromium webkit
    ;;
  bounded-import|native-postgis)
    database=turnright_gis_test
    limits=()
    if [[ "$mode" = bounded-import ]]; then
      database=turnright_import_test
      limits=(--memory 512m --memory-swap 512m)
    fi
    container="turnright-manual-${mode}-$$"
    container_created=false
    scratch="$(mktemp -d)"
    cleanup() {
      if [[ "$container_created" = true ]]; then docker rm -f "$container" >/dev/null; fi
      rm -f "$scratch/gis-backup.dump"
      rmdir "$scratch"
    }
    trap cleanup EXIT
    docker run -d --rm --name "$container" "${limits[@]}" -p 127.0.0.1::5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=disposable-test-only -e POSTGRES_DB="$database" postgis/postgis:17-3.5
    container_created=true
    ready=false
    for attempt in $(seq 1 60); do
      if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres -d "$database" >/dev/null 2>&1; then ready=true; break; fi
      sleep 1
    done
    test "$ready" = true
    port="$(docker port "$container" 5432/tcp | sed -n 's/^127\.0\.0\.1://p')"
    [[ "$port" =~ ^[0-9]+$ ]]
    export GIS_TEST_DATABASE_URL="postgresql://postgres:disposable-test-only@127.0.0.1:$port/$database"
    if [[ "$mode" = bounded-import ]]; then
      python3 scripts/tests/check_import_queue_database.py
      python3 scripts/tests/check_import_retention_database.py
    else
      python3 scripts/gis/check_database.py
      docker exec "$container" pg_dump -U postgres -Fc turnright_gis_test > "$scratch/gis-backup.dump"
      docker exec "$container" createdb -U postgres -T template0 turnright_restore_test
      docker exec -i "$container" pg_restore -U postgres -d turnright_restore_test --exit-on-error < "$scratch/gis-backup.dump"
      test "$(docker exec "$container" psql -U postgres -d turnright_restore_test -Atc 'select count(*) from public.gis_feature_index')" = 100000
    fi
    ;;
  isolated-engine)
    docker build -t turnright-gis scripts/gis
    docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,size=512m -v "$PWD/scripts:/app:ro" --entrypoint python3 turnright-gis -m unittest discover -s /app/tests -p 'test_gis_processing.py' -v
    node scripts/gis/check_worker.mjs
    ;;
  gis-import)
    docker build -t turnright-gis-import -f scripts/map_import/Dockerfile scripts/map_import
    docker run --rm --network none --cap-drop ALL --security-opt no-new-privileges --read-only --tmpfs /tmp:rw,size=512m -v "$PWD/scripts:/app:ro" --entrypoint python3 turnright-gis-import -m unittest discover -s /app/tests -p 'test_map_import*.py' -v
    docker build --target test -t turnright-gis-import-test -f scripts/map_import/Dockerfile scripts/map_import
    mkdir -p coverage/python
    docker run --rm --user "$(id -u):$(id -g)" --network none --cap-drop ALL --security-opt no-new-privileges --read-only --tmpfs /tmp:rw,size=512m -e PYTHONDONTWRITEBYTECODE=1 -v "$PWD:/repo:ro" -v "$PWD/coverage/python:/repo/coverage/python:rw" -w /repo --entrypoint python3 turnright-gis-import-test scripts/test_python.py
    python3 scripts/tests/check_map_import_worker.py
    ;;
  local-stack)
    require_fresh_stack
    docker build -t turnright-development .
    docker run --rm turnright-development node --version
    docker run --rm turnright-development python --version
    stack_pid=''
    cleanup_stack() {
      npm run local:down
      if [[ -n "$stack_pid" ]]; then wait "$stack_pid" || true; fi
    }
    trap cleanup_stack EXIT
    start_stack() {
      npm run local:up > .local-runtime/manual-stack.log 2>&1 &
      stack_pid=$!
      local ready=false
      for attempt in $(seq 1 240); do
        if curl --fail --silent http://127.0.0.1:5180/packages/campuses.json > /dev/null; then ready=true; break; fi
        if ! kill -0 "$stack_pid" 2>/dev/null; then break; fi
        sleep 5
      done
      if [[ "$ready" != true ]]; then cat .local-runtime/manual-stack.log; return 1; fi
    }
    stop_stack() {
      npm run local:down
      wait "$stack_pid"
      stack_pid=''
    }
    start_stack
    npm run local:test
    node --import tsx scripts/local/browser.mts
    stop_stack
    start_stack
    node --import tsx scripts/local/acceptance.mts --persistence
    npm run local:reset -- --confirm-local-reset
    wait "$stack_pid"
    stack_pid=''
    start_stack
    npm run local:test -- --after-reset
    stop_stack
    trap - EXIT
    ;;
  python-audit)
    python3 -m pip_audit --strict --disable-pip --no-deps -r scripts/requirements-quality.lock
    python3 -m pip_audit --strict --disable-pip --no-deps -r scripts/map_import/requirements.lock -r scripts/map_import/requirements-test.lock -r scripts/gis/requirements.lock -r scripts/gis/requirements-test.lock
    ;;
  secret-history)
    test "$(gitleaks version)" = 8.30.1
    node scripts/secret-history-self-test.mjs
    node scripts/secret-history.mjs
    ;;
  static-analysis)
    rules=.local-runtime/semgrep-rules
    if [[ ! -e "$rules" ]]; then
      git clone --no-checkout https://github.com/semgrep/semgrep-rules.git "$rules"
      git -C "$rules" checkout --detach 17e31e11ebac99fb7dfe1cd288f7a32151b6f3f9
    fi
    test "$(git -C "$rules" rev-parse HEAD)" = 17e31e11ebac99fb7dfe1cd288f7a32151b6f3f9
    test -z "$(git -C "$rules" status --porcelain --untracked-files=all)"
    mkdir -p .local-runtime/security
    docker run --rm -v "$PWD:/src" -w /src semgrep/semgrep:1.182.0@sha256:4a34048c04fef049f71665047f074cffb00cc3d89482f965a5cd151d589237af \
      semgrep scan --metrics=off --disable-version-check --strict --error \
      --config .local-runtime/semgrep-rules/javascript/lang/security \
      --config .local-runtime/semgrep-rules/javascript/browser/security \
      --config .local-runtime/semgrep-rules/javascript/node-crypto/security \
      --config .local-runtime/semgrep-rules/typescript/lang/security \
      --config .local-runtime/semgrep-rules/typescript/react/security \
      --config .local-runtime/semgrep-rules/python/lang/security \
      --config .local-runtime/semgrep-rules/python/requests/security \
      --config .local-runtime/semgrep-rules/yaml/github-actions/security \
      --json-output .local-runtime/security/semgrep.json \
      --sarif-output .local-runtime/security/semgrep.sarif \
      web/src web/api web/server web/scripts web/hooks web/lib web/components scripts .github
    ;;
  *) echo 'Unknown validation gate' >&2; exit 1 ;;
esac
