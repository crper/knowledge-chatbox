from __future__ import annotations

import os
import re
import select
import subprocess
import textwrap
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
JUSTFILE_PATH = REPO_ROOT / "justfile"
DEV_RUN_SCRIPT = REPO_ROOT / "scripts" / "dev-run.sh"
DOCKER_DEPLOY_SCRIPT = REPO_ROOT / "scripts" / "docker-deploy.sh"
WEB_NODE_VERSION_PATH = REPO_ROOT / "apps" / "web" / ".node-version"


def test_dev_recipes_forward_ports_to_dev_script() -> None:
    content = JUSTFILE_PATH.read_text(encoding="utf-8")
    expected_line = "API_PORT={{api_port}} WEB_PORT={{web_port}} {{dev_script}}"

    assert content.count(expected_line) == 2


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
        output = read_output_until(process, timeout_seconds=2.0)
    finally:
        terminate_process(process)

    assert "http://localhost:13000" in output
    assert "http://localhost:18080/api/health" in output
    assert "http://localhost:18080/docs" in output
    assert "http://localhost:18080/redoc" in output
    assert "http://localhost:18080/openapi.json" in output


def test_docker_deploy_wait_for_http_retries_quietly_until_final_failure() -> None:
    content = DOCKER_DEPLOY_SCRIPT.read_text(encoding="utf-8")

    assert 'curl --fail --silent --max-time 3 "$url" >/dev/null 2>&1' in content
    assert 'curl --fail --silent --show-error --max-time 3 "$url" >/dev/null || true' in content


def write_executable(path: Path, body: str) -> None:
    path.write_text(textwrap.dedent(body), encoding="utf-8")
    path.chmod(0o755)


def read_output_until(process: subprocess.Popen[str], *, timeout_seconds: float) -> str:
    assert process.stdout is not None

    output: list[str] = []
    deadline = time.monotonic() + timeout_seconds

    while time.monotonic() < deadline:
        ready, _, _ = select.select([process.stdout], [], [], 0.1)
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
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=2)
