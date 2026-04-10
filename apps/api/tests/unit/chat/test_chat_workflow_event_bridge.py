from __future__ import annotations

from pydantic_ai import Agent, AgentRunResultEvent
from pydantic_ai.messages import (
    FinalResultEvent,
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    PartDeltaEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
    ToolCallPart,
    ToolReturnPart,
)
from pydantic_ai.models.test import TestModel

from knowledge_chatbox_api.services.chat.workflow.event_bridge import ChatWorkflowEventBridge
from knowledge_chatbox_api.services.chat.workflow.output import ChatWorkflowResult


def test_event_bridge_maps_tool_call_and_result_events() -> None:
    bridge = ChatWorkflowEventBridge()

    tool_call = bridge.map_event(
        FunctionToolCallEvent(part=ToolCallPart("knowledge_search", {"query": "hello"}, "call-1")),
        run_id=7,
        assistant_message_id=11,
    )
    assert tool_call[0][0] == "tool.call"

    tool_result = bridge.map_event(
        FunctionToolResultEvent(
            result=ToolReturnPart(
                "knowledge_search",
                {
                    "context_sections": ["Document: test"],
                    "sources": [{"document_id": 1, "snippet": "source"}],
                },
                "call-1",
            )
        ),
        run_id=7,
        assistant_message_id=11,
    )
    assert tool_result[0][0] == "tool.result"
    assert tool_result[1][0] == "part.source"


def test_event_bridge_maps_text_events() -> None:
    bridge = ChatWorkflowEventBridge()

    start = bridge.map_event(
        PartStartEvent(index=0, part=TextPart("")),
        run_id=7,
        assistant_message_id=11,
    )
    delta = bridge.map_event(
        PartDeltaEvent(index=0, delta=TextPartDelta("你好")),
        run_id=7,
        assistant_message_id=11,
    )
    assert start[0][0] == "part.text.start"
    assert delta[0][0] == "part.text.delta"


def test_event_bridge_ignores_final_result_event() -> None:
    bridge = ChatWorkflowEventBridge()
    mapped = bridge.map_event(
        FinalResultEvent(tool_name=None, tool_call_id=None),
        run_id=7,
        assistant_message_id=11,
    )
    assert mapped == []


def test_event_bridge_extracts_final_output_and_usage() -> None:
    bridge = ChatWorkflowEventBridge()
    agent = Agent(
        TestModel(call_tools=[], custom_output_args={"answer": "hi", "sources": []}),
        output_type=ChatWorkflowResult,
        defer_model_check=True,
    )
    result = agent.run_sync("hello", deps=None)
    event = AgentRunResultEvent(result=result)

    output, usage = bridge.extract_result(event)

    assert output.answer == "hi"
    assert usage is not None
