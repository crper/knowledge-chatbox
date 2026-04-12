from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.anthropic import AnthropicProvider
from pydantic_ai.providers.openai import OpenAIProvider

from knowledge_chatbox_api.models.enums import ProviderName
from knowledge_chatbox_api.providers.ollama_url import build_ollama_openai_base_url
from knowledge_chatbox_api.schemas.settings import ProviderRuntimeSettings


def _strip_or_none(value: str | None) -> str | None:
    """去除字符串两端空白,如果为空则返回 None。"""
    if value is None:
        return None
    stripped: str = value.strip()
    return stripped or None


def build_chat_agent_model(
    runtime_settings: ProviderRuntimeSettings,
) -> AnthropicModel | OpenAIChatModel:
    """根据运行时设置构建聊天 agent 使用的模型实例。

    Args:
        runtime_settings: Provider 运行时设置，包含 provider 路由和配置信息

    Returns:
        AnthropicModel 或 OpenAIChatModel 实例

    Raises:
        ValueError: 当 provider 不支持时抛出
    """
    route = runtime_settings.response_route
    profiles = runtime_settings.provider_profiles

    if route.provider == ProviderName.ANTHROPIC:
        return AnthropicModel(
            route.model,
            provider=AnthropicProvider(
                api_key=_strip_or_none(profiles.anthropic.api_key),
                base_url=_strip_or_none(profiles.anthropic.base_url),
            ),
        )

    if route.provider == ProviderName.OLLAMA:
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
