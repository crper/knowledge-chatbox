from __future__ import annotations

from typing import TYPE_CHECKING, cast

from tests.fixtures.dummies import DummyRuntimeSettings

from knowledge_chatbox_api.models.enums import ResponseProvider
from knowledge_chatbox_api.schemas.settings import ResponseRouteConfig
from knowledge_chatbox_api.services.chat.workflow.model_factory import build_chat_agent_model

if TYPE_CHECKING:
    from knowledge_chatbox_api.services.settings.runtime_settings import ProviderRuntimeSettings


def test_build_chat_agent_model_supports_all_providers() -> None:
    providers: list[ResponseProvider] = [
        ResponseProvider.OPENAI,
        ResponseProvider.ANTHROPIC,
        ResponseProvider.OLLAMA,
    ]
    models = ["gpt-5.4", "claude-sonnet-4-5", "qwen3.5:4b"]
    for provider, model_name in zip(providers, models, strict=True):
        settings = DummyRuntimeSettings(
            response_route=ResponseRouteConfig(provider=provider, model=model_name),
        )
        assert build_chat_agent_model(cast("ProviderRuntimeSettings", settings)) is not None


def test_build_chat_agent_model_normalizes_ollama_v1_suffix() -> None:
    settings = DummyRuntimeSettings(
        response_route=ResponseRouteConfig(provider=ResponseProvider.OLLAMA, model="qwen3.5:4b"),
    )
    settings.provider_profiles.ollama.base_url = "http://localhost:11434/v1/"

    model = build_chat_agent_model(cast("ProviderRuntimeSettings", settings))

    assert model.base_url.rstrip("/") == "http://localhost:11434/v1"
