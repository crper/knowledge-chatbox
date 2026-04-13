from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
API_SRC = REPO_ROOT / "apps" / "api" / "src"

# export_openapi 不需要真实密钥，在导入 app 前注入最小环境变量，
# 避免 Settings 校验在非运行环境下失败。
os.environ.setdefault("JWT_SECRET_KEY", "knowledge-chatbox-dev-secret-key-32")
os.environ.setdefault("INITIAL_ADMIN_PASSWORD", "dev-only-not-for-production")


def build_openapi_payload() -> str:
    if str(API_SRC) not in sys.path:
        sys.path.insert(0, str(API_SRC))

    from knowledge_chatbox_api.main import create_app

    app = create_app()
    schema = app.openapi()
    return json.dumps(schema, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Export FastAPI OpenAPI schema to a file.")
    parser.add_argument("output", type=Path, help="OpenAPI schema output path")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Fail if the generated schema differs from the current file content.",
    )
    args = parser.parse_args()

    rendered = build_openapi_payload()
    output_path = args.output.resolve()

    if args.check:
        if not output_path.exists():
            print(f"OpenAPI schema file is missing: {output_path}", file=sys.stderr)
            return 1
        current = output_path.read_text(encoding="utf-8")
        if current != rendered:
            print(
                "OpenAPI schema is out of date. Run `cd apps/web && vp run api:generate`.",
                file=sys.stderr,
            )
            return 1
        return 0

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(rendered, encoding="utf-8")
    print(f"Wrote OpenAPI schema to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
