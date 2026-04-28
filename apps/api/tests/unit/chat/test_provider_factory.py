from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from knowledge_chatbox_api.models.enums import EmbeddingProvider, ResponseProvider, VisionProvider
from knowledge_chatbox_api.providers.anthropic_provider import AnthropicResponseAdapter
from knowledge_chatbox_api.providers.factory import (
    build_embedding_adapter,
    build_response_adapter,
    build_vision_adapter,
)
from knowledge_chatbox_api.providers.ollama_provider import OllamaVisionAdapter
from knowledge_chatbox_api.providers.openai_provider import OpenAIResponseAdapter
from knowledge_chatbox_api.providers.voyage_provider import VoyageEmbeddingAdapter
from knowledge_chatbox_api.schemas.settings import (
    EmbeddingRouteConfig,
    ResponseRouteConfig,
    VisionRouteConfig,
)

PACKAGE_ROOT = Path(__file__).resolve().parents[2]


def run_module_import(
    module_name: str, *, env_overrides: dict[str, str]
) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    existing_pythonpath = env.get("PYTHONPATH")
    env["PYTHONPATH"] = (
        f"{PACKAGE_ROOT / 'src'}{os.pathsep}{existing_pythonpath}"
        if existing_pythonpath
        else str(PACKAGE_ROOT / "src")
    )
    env.update(env_overrides)
    return subprocess.run(
        [sys.executable, "-c", f"import {module_name}"],
        cwd=PACKAGE_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def test_build_provider_adapters_accept_typed_route_models() -> None:
    assert isinstance(
        build_response_adapter(
            ResponseRouteConfig(provider=ResponseProvider.ANTHROPIC, model="claude-sonnet-4-5")
        ),
        AnthropicResponseAdapter,
    )
    assert isinstance(
        build_embedding_adapter(
            EmbeddingRouteConfig(provider=EmbeddingProvider.VOYAGE, model="voyage-3.5")
        ),
        VoyageEmbeddingAdapter,
    )
    assert isinstance(
        build_vision_adapter(VisionRouteConfig(provider=VisionProvider.OLLAMA, model="qwen3.5:4b")),
        OllamaVisionAdapter,
    )


def test_importing_provider_factory_succeeds_with_proxy_env() -> None:
    result = run_module_import(
        "knowledge_chatbox_api.providers.factory",
        env_overrides={"ALL_PROXY": "socks5://127.0.0.1:1080"},
    )

    assert result.returncode == 0, result.stderr


def test_openai_response_adapter_preserves_existing_gateway_path() -> None:
    assert (
        OpenAIResponseAdapter()._normalize_base_url("https://gateway.example.com/openai")  # pyright: ignore[reportPrivateUsage]
        == "https://gateway.example.com/openai"
    )
