from __future__ import annotations

from knowledge_chatbox_api.services.chat.workflow.model_factory import build_chat_agent_model


class DummyRoute:
    def __init__(self, provider: str, model: str) -> None:
        self.provider = provider
        self.model = model


class DummyProfiles:
    class OpenAI:
        api_key = "sk-openai"
        base_url = "https://api.openai.com/v1"

    class Anthropic:
        api_key = "sk-ant"
        base_url = "https://api.anthropic.com"

    class Ollama:
        base_url = "http://localhost:11434"

    openai = OpenAI()
    anthropic = Anthropic()
    ollama = Ollama()


class DummySettings:
    provider_profiles = DummyProfiles()
    response_route = DummyRoute("openai", "gpt-5.4")


def test_build_chat_agent_model_supports_all_providers() -> None:
    for provider, model_name in [
        ("openai", "gpt-5.4"),
        ("anthropic", "claude-sonnet-4-5"),
        ("ollama", "qwen3.5:4b"),
    ]:
        settings = DummySettings()
        settings.response_route = DummyRoute(provider, model_name)
        assert build_chat_agent_model(settings) is not None


def test_build_chat_agent_model_normalizes_ollama_v1_suffix() -> None:
    settings = DummySettings()
    settings.response_route = DummyRoute("ollama", "qwen3.5:4b")
    settings.provider_profiles.ollama.base_url = "http://localhost:11434/v1/"

    model = build_chat_agent_model(settings)

    assert model.base_url.rstrip("/") == "http://localhost:11434/v1"
