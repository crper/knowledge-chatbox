from __future__ import annotations

import os
import re
import select
import socket
import subprocess
import textwrap
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
JUSTFILE_PATH = REPO_ROOT / "justfile"
DEV_RUN_SCRIPT = REPO_ROOT / "scripts" / "dev-run.sh"
DOCKER_DEPLOY_LIB = REPO_ROOT / "scripts" / "lib" / "docker-deploy.sh"
API_DOCKERFILE_PATH = REPO_ROOT / "apps" / "api" / "Dockerfile"
WEB_NODE_VERSION_PATH = REPO_ROOT / "apps" / "web" / ".node-version"
WEB_DOCKERFILE_PATH = REPO_ROOT / "apps" / "web" / "Dockerfile"
WEB_DOCKERIGNORE_PATH = REPO_ROOT / "apps" / "web" / ".dockerignore"


def test_dev_recipes_forward_ports_to_dev_script() -> None:
    content = JUSTFILE_PATH.read_text(encoding="utf-8")
    expected_line = "    API_PORT={{api_port}} WEB_PORT={{web_port}} {{dev_script}}"
    actual_matches = [line for line in content.splitlines() if line == expected_line]

    assert len(actual_matches) == 2


def test_reset_dev_recipe_preflights_ports_before_resetting_data() -> None:
    content = JUSTFILE_PATH.read_text(encoding="utf-8")

    assert "reset-dev: reset-data" not in content
    assert "API_PORT={{api_port}} WEB_PORT={{web_port}} {{dev_script}} --check-only" in content


def test_web_pins_exact_node_version_without_mirror_override() -> None:
    content = JUSTFILE_PATH.read_text(encoding="utf-8")
    node_version = WEB_NODE_VERSION_PATH.read_text(encoding="utf-8").strip()

    assert re.fullmatch(r"\d+\.\d+\.\d+", node_version)
    assert "VITE_NODE_DIST_MIRROR" not in content


def test_dev_run_prints_local_service_urls(tmp_path: Path) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    api_dir = tmp_path / "api"
    web_dir = tmp_path / "web"
    api_dir.mkdir()
    web_dir.mkdir()

    write_executable(
        fake_bin / "uv",
        """#!/usr/bin/env bash
set -Eeuo pipefail

if [[ \
  "${1:-}" == "run" \
  && "${2:-}" == "python" \
  && "${3:-}" == "-m" \
  && "${4:-}" == "alembic" \
]]; then
  echo "[fake-uv] alembic ok"
  exit 0
fi

if [[ "${1:-}" == "run" && "${2:-}" == "-m" && "${3:-}" == "uvicorn" ]]; then
  echo "[fake-uv] uvicorn ok"
  trap 'exit 0' INT TERM
  while true; do
    sleep 0.1
  done
fi

echo "[fake-uv] unexpected args: $*" >&2
exit 1
""",
    )

    write_executable(
        fake_bin / "vp",
        """#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${1:-}" == "run" && "${2:-}" == "api:check" ]]; then
  exit 0
fi

if [[ "${1:-}" == "dev" ]]; then
  echo "[fake-vp] dev ok"
  trap 'exit 0' INT TERM
  while true; do
    sleep 0.1
  done
fi

echo "[fake-vp] unexpected args: $*" >&2
exit 1
""",
    )

    write_executable(
        fake_bin / "curl",
        """#!/usr/bin/env bash
set -Eeuo pipefail
exit 0
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{fake_bin}:{env['PATH']}"
    env["API_DIR"] = str(api_dir)
    env["WEB_DIR"] = str(web_dir)
    env["API_PORT"] = "18080"
    env["WEB_PORT"] = "13000"

    process = subprocess.Popen(
        ["bash", str(DEV_RUN_SCRIPT)],
        cwd=REPO_ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    try:
        output = read_output_until(process, timeout_seconds=5.0)
    finally:
        terminate_process(process)

    assert "http://localhost:13000" in output
    assert "http://localhost:18080/api/health" in output
    assert "http://localhost:18080/docs" in output
    assert "http://localhost:18080/redoc" in output
    assert "http://localhost:18080/openapi.json" in output


def test_dev_run_waits_for_api_health_before_starting_web(tmp_path: Path) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    api_dir = tmp_path / "api"
    web_dir = tmp_path / "web"
    api_dir.mkdir()
    web_dir.mkdir()
    curl_state = tmp_path / "curl-count.txt"
    vp_state = tmp_path / "vp-started.txt"

    write_executable(
        fake_bin / "uv",
        """#!/usr/bin/env bash
set -Eeuo pipefail

if [[ \
  "${1:-}" == "run" \
  && "${2:-}" == "python" \
  && "${3:-}" == "-m" \
  && "${4:-}" == "alembic" \
]]; then
  exit 0
fi

if [[ "${1:-}" == "run" && "${2:-}" == "-m" && "${3:-}" == "uvicorn" ]]; then
  trap 'exit 0' INT TERM
  while true; do
    sleep 0.1
  done
fi

echo "[fake-uv] unexpected args: $*" >&2
exit 1
""",
    )

    write_executable(
        fake_bin / "curl",
        f"""#!/usr/bin/env bash
set -Eeuo pipefail

state_file="{curl_state}"
count=0
if [[ -f "$state_file" ]]; then
  count=$(cat "$state_file")
fi
count=$((count + 1))
printf '%s' "$count" >"$state_file"

if (( count < 3 )); then
  exit 22
fi

exit 0
""",
    )

    write_executable(
        fake_bin / "vp",
        f"""#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${{1:-}}" == "run" && "${{2:-}}" == "api:check" ]]; then
  exit 0
fi

if [[ "${{1:-}}" == "dev" ]]; then
  printf 'started' >"{vp_state}"
  trap 'exit 0' INT TERM
  while true; do
    sleep 0.1
  done
fi

echo "[fake-vp] unexpected args: $*" >&2
exit 1
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{fake_bin}:{env['PATH']}"
    env["API_DIR"] = str(api_dir)
    env["WEB_DIR"] = str(web_dir)
    env["API_PORT"] = "18081"
    env["WEB_PORT"] = "13001"

    process = subprocess.Popen(
        ["bash", str(DEV_RUN_SCRIPT)],
        cwd=REPO_ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    try:
        output = read_output_until(process, timeout_seconds=5.0)
    finally:
        terminate_process(process)

    assert curl_state.read_text(encoding="utf-8") == "3"
    assert vp_state.read_text(encoding="utf-8") == "started"
    assert "API 已就绪" in output


def test_dev_run_fails_fast_when_api_port_is_occupied(tmp_path: Path) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    api_dir = tmp_path / "api"
    web_dir = tmp_path / "web"
    api_dir.mkdir()
    web_dir.mkdir()

    write_executable(
        fake_bin / "uv",
        """#!/usr/bin/env bash
set -Eeuo pipefail
echo "[fake-uv] should not run" >&2
exit 1
""",
    )

    write_executable(
        fake_bin / "vp",
        """#!/usr/bin/env bash
set -Eeuo pipefail
echo "[fake-vp] should not run" >&2
exit 1
""",
    )

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        occupied_port = listener.getsockname()[1]

        env = os.environ.copy()
        env["PATH"] = f"{fake_bin}:{env['PATH']}"
        env["API_DIR"] = str(api_dir)
        env["WEB_DIR"] = str(web_dir)
        env["API_PORT"] = str(occupied_port)
        env["WEB_PORT"] = str(occupied_port + 1)

        result = subprocess.run(
            ["bash", str(DEV_RUN_SCRIPT), "--check-only"],
            cwd=REPO_ROOT,
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )

    assert result.returncode != 0
    combined_output = result.stdout + result.stderr
    assert f"端口 {occupied_port}" in combined_output
    assert "请先停止现有进程" in combined_output


def test_dev_run_default_ready_budget_tolerates_slow_api_startup(tmp_path: Path) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    api_dir = tmp_path / "api"
    web_dir = tmp_path / "web"
    api_dir.mkdir()
    web_dir.mkdir()
    curl_state = tmp_path / "curl-count.txt"
    vp_state = tmp_path / "vp-started.txt"

    write_executable(
        fake_bin / "uv",
        """#!/usr/bin/env bash
set -Eeuo pipefail

if [[ \
  "${1:-}" == "run" \
  && "${2:-}" == "python" \
  && "${3:-}" == "-m" \
  && "${4:-}" == "alembic" \
]]; then
  exit 0
fi

if [[ "${1:-}" == "run" && "${2:-}" == "-m" && "${3:-}" == "uvicorn" ]]; then
  trap 'exit 0' INT TERM
  while true; do
    sleep 0.1
  done
fi

echo "[fake-uv] unexpected args: $*" >&2
exit 1
""",
    )

    write_executable(
        fake_bin / "curl",
        f"""#!/usr/bin/env bash
set -Eeuo pipefail

state_file="{curl_state}"
count=0
if [[ -f "$state_file" ]]; then
  count=$(cat "$state_file")
fi
count=$((count + 1))
printf '%s' "$count" >"$state_file"

if (( count < 80 )); then
  exit 22
fi

exit 0
""",
    )

    write_executable(
        fake_bin / "sleep",
        """#!/usr/bin/env bash
set -Eeuo pipefail
exit 0
""",
    )

    write_executable(
        fake_bin / "vp",
        f"""#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${{1:-}}" == "run" && "${{2:-}}" == "api:check" ]]; then
  exit 0
fi

if [[ "${{1:-}}" == "dev" ]]; then
  printf 'started' >"{vp_state}"
  trap 'exit 0' INT TERM
  while true; do
    sleep 0.1
  done
fi

echo "[fake-vp] unexpected args: $*" >&2
exit 1
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{fake_bin}:{env['PATH']}"
    env["API_DIR"] = str(api_dir)
    env["WEB_DIR"] = str(web_dir)
    env["API_PORT"] = "18082"
    env["WEB_PORT"] = "13002"

    process = subprocess.Popen(
        ["bash", str(DEV_RUN_SCRIPT)],
        cwd=REPO_ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    try:
        output = read_output_until(process, timeout_seconds=8.0)
    finally:
        terminate_process(process)

    assert curl_state.read_text(encoding="utf-8") == "80"
    assert vp_state.read_text(encoding="utf-8") == "started"
    assert "API 已就绪" in output


def test_docker_deploy_wait_for_http_retries_quietly_until_final_failure() -> None:
    content = DOCKER_DEPLOY_LIB.read_text(encoding="utf-8")

    assert 'curl --fail --silent --max-time 3 "$url" >/dev/null 2>&1' in content
    assert 'curl --fail --silent --show-error --max-time 3 "$url" >/dev/null || true' in content


def test_docker_check_accepts_same_origin_api_base_url(tmp_path: Path) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    env_file = tmp_path / ".env.docker-check"
    compose_environment = tmp_path / "compose-environment.txt"
    upload_dir = tmp_path / "uploads"
    normalized_dir = tmp_path / "normalized"
    chroma_dir = tmp_path / "chroma"
    sqlite_path = tmp_path / "sqlite" / "ai_qa.db"

    env_file.write_text("placeholder=true\n", encoding="utf-8")
    compose_environment.write_text(
        "\n".join(
            [
                "API_PORT=18000",
                "WEB_PORT=13000",
                "JWT_SECRET_KEY=secret",
                "INITIAL_ADMIN_USERNAME=admin",
                "INITIAL_ADMIN_PASSWORD=password",
                "VITE_API_BASE_URL=/api",
                f"UPLOAD_DIR={upload_dir}",
                f"NORMALIZED_DIR={normalized_dir}",
                f"SQLITE_PATH={sqlite_path}",
                f"CHROMA_PATH={chroma_dir}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    write_executable(
        fake_bin / "docker",
        f"""#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${{1:-}}" != "compose" ]]; then
  echo "[fake-docker] unexpected args: $*" >&2
  exit 1
fi
shift

while (($# > 0)); do
  case "$1" in
    --env-file|-f)
      shift 2
      ;;
    config)
      shift
      case "${{1:-}}" in
        --environment)
          cat "{compose_environment}"
          exit 0
          ;;
        -q)
          exit 0
          ;;
      esac
      ;;
    *)
      echo "[fake-docker] unexpected args: $*" >&2
      exit 1
      ;;
  esac
done

echo "[fake-docker] missing config command" >&2
exit 1
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{fake_bin}:{env['PATH']}"
    env["ENV_FILE"] = str(env_file)
    env.pop("INITIAL_ADMIN_PASSWORD", None)

    result = subprocess.run(
        ["bash", str(REPO_ROOT / "scripts" / "docker-deploy.sh"), "check"],
        cwd=REPO_ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr or result.stdout


def test_docker_check_does_not_require_bootstrap_admin_password(tmp_path: Path) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    env_file = tmp_path / ".env.docker-check"
    compose_environment = tmp_path / "compose-environment.txt"
    upload_dir = tmp_path / "uploads"
    normalized_dir = tmp_path / "normalized"
    chroma_dir = tmp_path / "chroma"
    sqlite_path = tmp_path / "sqlite" / "ai_qa.db"

    env_file.write_text("placeholder=true\n", encoding="utf-8")
    compose_environment.write_text(
        "\n".join(
            [
                "API_PORT=18000",
                "WEB_PORT=13000",
                "JWT_SECRET_KEY=secret-with-at-least-thirty-two-characters",
                "INITIAL_ADMIN_USERNAME=admin",
                f"UPLOAD_DIR={upload_dir}",
                f"NORMALIZED_DIR={normalized_dir}",
                f"SQLITE_PATH={sqlite_path}",
                f"CHROMA_PATH={chroma_dir}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    write_executable(
        fake_bin / "docker",
        f"""#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${{1:-}}" != "compose" ]]; then
  echo "[fake-docker] unexpected args: $*" >&2
  exit 1
fi
shift

while (($# > 0)); do
  case "$1" in
    --env-file|-f)
      shift 2
      ;;
    config)
      shift
      case "${{1:-}}" in
        --environment)
          cat "{compose_environment}"
          exit 0
          ;;
        -q)
          exit 0
          ;;
      esac
      ;;
    *)
      echo "[fake-docker] unexpected args: $*" >&2
      exit 1
      ;;
  esac
done

echo "[fake-docker] missing config command" >&2
exit 1
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{fake_bin}:{env['PATH']}"
    env["ENV_FILE"] = str(env_file)

    result = subprocess.run(
        ["bash", str(REPO_ROOT / "scripts" / "docker-deploy.sh"), "check"],
        cwd=REPO_ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr or result.stdout


def test_docker_up_rebuilds_images_before_starting_services() -> None:
    content = DOCKER_DEPLOY_LIB.read_text(encoding="utf-8")

    assert "compose_cmd up -d --build --remove-orphans" in content


def test_api_dockerfile_keeps_repo_and_runtime_entrypoint_names_consistent() -> None:
    content = API_DOCKERFILE_PATH.read_text(encoding="utf-8")

    assert "COPY --chmod=755 scripts/api-entrypoint.sh ./api-entrypoint.sh" in content
    assert 'ENTRYPOINT ["./api-entrypoint.sh"]' in content


def test_web_dockerfile_uses_consistent_registry_for_global_install_and_vp_install() -> None:
    content = WEB_DOCKERFILE_PATH.read_text(encoding="utf-8")

    assert "ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com" in content


def test_web_dockerignore_keeps_build_time_typescript_support_files() -> None:
    content = WEB_DOCKERIGNORE_PATH.read_text(encoding="utf-8")

    assert "src/test" not in content
    assert "dev-proxy.ts" not in content


def test_web_dockerfile_sets_ca_bundle_for_vp_install() -> None:
    content = WEB_DOCKERFILE_PATH.read_text(encoding="utf-8")

    assert "SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt" in content


def write_executable(path: Path, body: str) -> None:
    path.write_text(textwrap.dedent(body), encoding="utf-8")
    path.chmod(0o755)


def read_output_until(process: subprocess.Popen[str], *, timeout_seconds: float) -> str:
    assert process.stdout is not None

    output: list[str] = []
    deadline = time.monotonic() + timeout_seconds

    while time.monotonic() < deadline:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        ready, _, _ = select.select([process.stdout], [], [], min(0.2, remaining))
        if ready:
            line = process.stdout.readline()
            if not line:
                break
            output.append(line)
        if process.poll() is not None:
            break

    return "".join(output)


def terminate_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=3)
