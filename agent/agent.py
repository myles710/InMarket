import json
import os
from typing import Any, Dict, List, Tuple

import requests
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage, BaseMessage
from langchain_core.tools import tool


load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
if not ANTHROPIC_API_KEY:
    raise RuntimeError("ANTHROPIC_API_KEY environment variable is not set.")


MCP_BASE_URL = "http://localhost:3001"


@tool
def search_products(query: str) -> Dict[str, Any]:
    """Search for food products by keyword."""
    try:
        resp = requests.get(
            f"{MCP_BASE_URL}/search",
            params={"query": query, "pageSize": 10},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return {"error": f"search_products failed: {e}"}


@tool
def get_product_by_barcode(barcode: str) -> Dict[str, Any]:
    """Get a single product by barcode."""
    try:
        resp = requests.get(
            f"{MCP_BASE_URL}/product/{barcode}",
            timeout=10,
        )
        if resp.status_code == 404:
            return {"error": "Product not found", "barcode": barcode}
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return {"error": f"get_product_by_barcode failed: {e}", "barcode": barcode}


@tool
def get_products_by_category(category: str) -> Dict[str, Any]:
    """Get products by category name."""
    try:
        resp = requests.get(
            f"{MCP_BASE_URL}/category/{category}",
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return {"error": f"get_products_by_category failed: {e}", "category": category}


@tool
def get_products_by_brand(brand: str) -> Dict[str, Any]:
    """Get products by brand name."""
    try:
        resp = requests.get(
            f"{MCP_BASE_URL}/brand/{brand}",
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return {"error": f"get_products_by_brand failed: {e}", "brand": brand}


@tool
def compare_products(barcode1: str, barcode2: str) -> Dict[str, Any]:
    """Compare two products by barcode, focusing on name, brand, ingredients, and nutrition grade."""
    try:
        resp1 = requests.get(f"{MCP_BASE_URL}/product/{barcode1}", timeout=10)
        resp2 = requests.get(f"{MCP_BASE_URL}/product/{barcode2}", timeout=10)

        data1 = resp1.json() if resp1.status_code == 200 else {"error": "Product not found", "barcode": barcode1}
        data2 = resp2.json() if resp2.status_code == 200 else {"error": "Product not found", "barcode": barcode2}

        return {
            "product1": data1,
            "product2": data2,
        }
    except Exception as e:
        return {
            "error": f"compare_products failed: {e}",
            "barcode1": barcode1,
            "barcode2": barcode2,
        }


TOOLS = [
    search_products,
    get_product_by_barcode,
    get_products_by_category,
    get_products_by_brand,
    compare_products,
]


SYSTEM_PROMPT = (
    "You are a Consumer Product Intelligence Analyst. "
    "You help users understand food and grocery products, brands, ingredients, and nutrition data. "
    "Use the available tools to look up accurate information before answering. "
    "Explain things clearly and concisely, and highlight important health or dietary considerations where relevant."
)


model = ChatAnthropic(model="claude-sonnet-4-5", temperature=0)
model_with_tools = model.bind_tools(TOOLS)


class ChatRequest(BaseModel):
    message: str
    conversation_history: List[Dict[str, Any]] = Field(default_factory=list)


def _convert_history_to_messages(history: List[Dict[str, Any]]) -> List[BaseMessage]:
    messages: List[BaseMessage] = []
    for item in history:
        role = item.get("role")
        content = item.get("content")
        if not content:
            continue
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))
        else:
            messages.append(HumanMessage(content=content))
    return messages


def run_agent(message: str, conversation_history: List[Dict[str, Any]]) -> Tuple[str, List[str]]:
    messages: List[BaseMessage] = [SystemMessage(content=SYSTEM_PROMPT)]
    messages.extend(_convert_history_to_messages(conversation_history))
    messages.append(
        HumanMessage(
            content=(
                "User question:\n"
                f"{message}\n\n"
                "Answer with concrete product details (names, brands, nutrition grades, "
                "ingredients, categories, etc.) whenever available."
            )
        )
    )

    tools_used: List[str] = []

    # First call: allow the model to decide which tools to call.
    ai_message = model_with_tools.invoke(messages)

    if isinstance(ai_message, AIMessage) and ai_message.tool_calls:
        messages.append(ai_message)
        tool_messages: List[ToolMessage] = []
        aggregated_results: List[Dict[str, Any]] = []

        # Build a name -> tool map
        tool_map = {t.name: t for t in TOOLS}

        for tool_call in ai_message.tool_calls:
            name = getattr(tool_call, "name", None) or tool_call.get("name")  # type: ignore[union-attr]
            args = getattr(tool_call, "args", None) or tool_call.get("args", {})  # type: ignore[union-attr]

            tool_obj = tool_map.get(name)
            if not tool_obj:
                continue

            try:
                result = tool_obj.invoke(args)
                aggregated_results.append(
                    {
                        "tool": name,
                        "args": args,
                        "result": result,
                    }
                )
            except Exception as e:
                result = {"error": f"Tool {name} failed: {e}"}

            tools_used.append(name)

            tool_call_id = getattr(tool_call, "id", None) or tool_call.get("id")  # type: ignore[union-attr]
            tool_messages.append(
                ToolMessage(
                    content=json.dumps(result),
                    tool_call_id=tool_call_id or name,
                )
            )

        messages.extend(tool_messages)

        # Second call: get final answer from the base model (no more tools).
        # Claude only allows a single system message at the beginning, so we
        # add follow-up instructions as a human message instead.
        if aggregated_results:
            messages.append(
                HumanMessage(
                    content=(
                        "Based on the tool results above, please provide a detailed answer "
                        "including actual product names, brands, barcodes, categories, "
                        "ingredients, nutrition grades, and any other relevant product data. "
                        "If multiple tools or products were returned, synthesize and compare "
                        "them in one coherent explanation. Do NOT say that you are going to "
                        "look things up or call tools — you have already done so. Only report "
                        "what the tools returned.\n\n"
                        "For reference, here is a JSON summary of all tool results:\n"
                        + json.dumps(aggregated_results, ensure_ascii=False)
                    )
                )
            )
        else:
            messages.append(
                HumanMessage(
                    content=(
                        "Please provide a detailed answer grounded in the tool results above. "
                        "Include any concrete product data available (names, brands, "
                        "ingredients, nutrition grades, etc.), and do not describe future "
                        "tool calls — only what has already been returned."
                    )
                )
            )

        final_ai_message = model.invoke(messages)
        return final_ai_message.content, tools_used

    # No tools were used, just return the direct response.
    return ai_message.content, tools_used


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/chat")
async def chat(request: ChatRequest):
    response_text, tools_used = await run_in_threadpool(run_agent, request.message, request.conversation_history)
    return {"response": response_text, "tools_used": tools_used}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("agent:app", host="0.0.0.0", port=8000, reload=True)
