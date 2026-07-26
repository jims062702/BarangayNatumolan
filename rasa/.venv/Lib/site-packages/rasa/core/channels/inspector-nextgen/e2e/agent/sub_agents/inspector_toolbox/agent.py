from typing import Any, Dict, List

from rasa.agents.protocol.mcp.mcp_open_agent import MCPOpenAgent
from rasa.agents.schemas import AgentToolContext, AgentToolResult


class InspectorToolboxAgent(MCPOpenAgent):
    def get_custom_tool_definitions(self) -> List[Dict[str, Any]]:
        return [
            {
                "type": "function",
                "function": {
                    "name": "inspector_success_marker",
                    "description": (
                        "Use only for the exact diagnostic request "
                        "'inspector test custom tool success'. Returns a stable "
                        "success result for next-gen Inspector tool-call rows."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "scenario": {
                                "type": "string",
                                "description": "The Inspector scenario name.",
                            },
                        },
                        "required": ["scenario"],
                        "additionalProperties": False,
                    },
                    "strict": True,
                },
                "tool_executor": self._inspector_success_marker,
            },
            {
                "type": "function",
                "function": {
                    "name": "inspector_failure_marker",
                    "description": (
                        "Use only for the exact diagnostic request "
                        "'inspector test custom tool failure'. Always returns a "
                        "tool error so the next-gen Inspector can display tool "
                        "failure details."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "scenario": {
                                "type": "string",
                                "description": "The Inspector scenario name.",
                            },
                        },
                        "required": ["scenario"],
                        "additionalProperties": False,
                    },
                    "strict": True,
                },
                "tool_executor": self._inspector_failure_marker,
            },
        ]

    async def _inspector_success_marker(
        self, arguments: Dict[str, Any], _tool_context: AgentToolContext
    ) -> AgentToolResult:
        scenario = arguments["scenario"]
        return AgentToolResult(
            tool_name="inspector_success_marker",
            result=f"Inspector custom tool success marker for {scenario}.",
        )

    async def _inspector_failure_marker(
        self, arguments: Dict[str, Any], _tool_context: AgentToolContext
    ) -> AgentToolResult:
        scenario = arguments["scenario"]
        return AgentToolResult(
            tool_name="inspector_failure_marker",
            is_error=True,
            error_message=f"Inspector custom tool failure marker for {scenario}.",
        )
