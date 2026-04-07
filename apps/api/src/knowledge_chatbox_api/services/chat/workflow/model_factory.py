from __future__ import annotations

from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.anthropic import AnthropicProvider
from pydantic_ai.providers.openai import OpenAIProvider

from knowledge_chatbox_api.providers.ollama_url import build_ollama_openai_base_url


def _strip_or_none(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def build_chat_agent_model(runtime_settings):
    route = runtime_settings.response_route
    profiles = runtime_settings.provider_profiles

    if route.provider == "anthropic":
        return AnthropicModel(
            route.model,
            provider=AnthropicProvider(
                api_key=_strip_or_none(profiles.anthropic.api_key),
                base_url=_strip_or_none(profiles.anthropic.base_url),
            ),
        )

    if route.provider == "ollama":
        return OpenAIChatModel(
            route.model,
            provider=OpenAIProvider(
                base_url=build_ollama_openai_base_url(profiles.ollama.base_url),
                api_key="ollama",
            ),
        )

    return OpenAIChatModel(
        route.model,
        provider=OpenAIProvider(
            base_url=_strip_or_none(profiles.openai.base_url),
            api_key=_strip_or_none(profiles.openai.api_key),
        ),
    )
