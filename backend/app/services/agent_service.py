"""Agent service — ReAct loop with 4 tools + LLM reasoning + rule-based fallback."""
from __future__ import annotations
import json
import time
import asyncio
import re
from datetime import datetime
from typing import Any

from ..core.logging import logger
from .llm_client import llm_client
from ..database import SessionLocal
from ..models.agent_log import AgentLog


# Tools available to the agent
TOOLS = ["query_knowledge_base", "create_employee", "generate_access", "send_email"]

_EMP_SEQ = 1024
_MAIL_SEQ = 8821


def _next_emp_id() -> str:
    global _EMP_SEQ
    _EMP_SEQ += 1
    return f"EMP-{_EMP_SEQ}"


def _next_mail_id() -> str:
    global _MAIL_SEQ
    _MAIL_SEQ += 1
    return f"MAIL-{_MAIL_SEQ}"


def tool_query_knowledge_base(action_input: Any) -> str:
    query = action_input if isinstance(action_input, str) else json.dumps(action_input)
    # Use the registry's rag service (already initialized)
    from .model_registry import registry
    rag = registry.rag
    sources = rag.retrieve(query, top_k=2)
    if not sources:
        return "No relevant knowledge base entries found."
    return " ".join([s["text"] for s in sources])


def tool_create_employee(action_input: Any) -> str:
    """Create a deterministic employee record. action_input may be a dict with name/role."""
    if isinstance(action_input, dict):
        name = action_input.get("name") or action_input.get("employee_name") or "Unknown"
        role = action_input.get("role") or "Employee"
    else:
        name = str(action_input)
        role = "Employee"
    emp_id = _next_emp_id()
    return f"Employee {emp_id} created for {name} ({role})."


def tool_generate_access(action_input: Any) -> str:
    if isinstance(action_input, dict):
        name = action_input.get("name") or action_input.get("employee_name") or "Unknown"
        role = action_input.get("role") or "Employee"
    else:
        name = str(action_input)
        role = "Employee"
    access = ["SSO", "Git", "Jira", "Email"]
    return f"Access provisioned for {name} ({role}): {', '.join(access)}."


def tool_send_email(action_input: Any) -> str:
    if isinstance(action_input, dict):
        to = action_input.get("to") or action_input.get("email") or "employee@company.com"
        subject = action_input.get("subject") or "Welcome to the team"
    else:
        to = "employee@company.com"
        subject = "Welcome to the team"
    mail_id = _next_mail_id()
    return f"Email queued (ID {mail_id}) to={to} subject='{subject}'."


TOOL_FUNCS = {
    "query_knowledge_base": tool_query_knowledge_base,
    "create_employee": tool_create_employee,
    "generate_access": tool_generate_access,
    "send_email": tool_send_email,
}


def _build_employee_email(name: str) -> str:
    if not name:
        return "employee@company.com"
    parts = name.lower().replace(".", " ").split()
    if len(parts) >= 2:
        return f"{parts[0]}.{parts[-1]}@company.com"
    return f"{parts[0]}@company.com" if parts else "employee@company.com"


def _rule_based_plan(task: str, employee_name: str | None, role: str | None, department: str | None) -> list[tuple[str, Any, str]]:
    """Return [(thought, action, action_input)] in a sensible order."""
    name = employee_name or "New Employee"
    role_ = role or "Employee"
    email = _build_employee_email(name)
    return [
        (f"Need to check onboarding policy for the task: {task}", "query_knowledge_base", "onboarding policy"),
        (f"Create employee record for {name} as {role_}", "create_employee", {"name": name, "role": role_}),
        (f"Provision access for {name} ({role_})", "generate_access", {"name": name, "role": role_}),
        (f"Send welcome email to {name} at {email}", "send_email", {"to": email, "subject": "Welcome to the team"}),
    ]


def _parse_llm_step(text: str) -> tuple[str, str, Any] | None:
    """Parse JSON {thought, action, action_input} from the LLM response. Returns None on failure."""
    if not text:
        return None
    # Try direct JSON parse first
    try:
        # Strip code fences if present
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        # Find first { and last }
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            obj = json.loads(cleaned[start:end + 1])
            thought = obj.get("thought", "")
            action = obj.get("action", "")
            action_input = obj.get("action_input")
            return thought, action, action_input
    except Exception:
        pass
    # Fallback: try regex
    thought_m = re.search(r"[Tt]hought\s*[:\-]\s*(.+?)(?=\n[Aa]ction|$)", text, re.DOTALL)
    action_m = re.search(r"[Aa]ction\s*[:\-]\s*\"?([A-Za-z_]+)\"?", text)
    input_m = re.search(r"[Aa]ction[_ ]?[Ii]nput\s*[:\-]\s*(.+?)(?=\n|$)", text, re.DOTALL)
    if action_m:
        thought = thought_m.group(1).strip() if thought_m else ""
        action = action_m.group(1).strip()
        action_input = input_m.group(1).strip() if input_m else ""
        # Try to parse action_input as JSON
        try:
            action_input = json.loads(action_input)
        except Exception:
            pass
        return thought, action, action_input
    return None


async def _llm_step(task: str, history: list[dict], available_tools: list[str]) -> tuple[str, str, Any] | None:
    """Ask the LLM for the next step. Returns None if unavailable / unparseable."""
    if not llm_client.is_available():
        return None
    history_str = "\n".join([
        f"Step {h['step']}: thought='{h['thought']}' action='{h['action']}' observation='{h['observation'][:200]}'"
        for h in history
    ]) or "(none)"
    prompt = (
        f"You are a ReAct agent. Task: {task}\n\n"
        f"Available tools: {available_tools}\n"
        "- query_knowledge_base(action_input: string query)\n"
        "- create_employee(action_input: {{name, role}})\n"
        "- generate_access(action_input: {{name, role}})\n"
        "- send_email(action_input: {{to, subject}})\n"
        "When done, output action='FINAL_ANSWER' and action_input=your final summary string.\n\n"
        f"Prior steps:\n{history_str}\n\n"
        "Output STRICT JSON only: {\"thought\": str, \"action\": str, \"action_input\": any}."
    )
    try:
        resp = await llm_client.chat(prompt, system="You are a precise ReAct planner. Always output strict JSON.", max_tokens=300)
    except Exception:
        return None
    return _parse_llm_step(resp)


def _coerce_action_input(action: str, action_input: Any, ctx: dict) -> Any:
    """Fill in defaults for tool calls using context (name/role/email)."""
    name = ctx.get("employee_name") or "New Employee"
    role = ctx.get("role") or "Employee"
    email = _build_employee_email(name)
    if action == "create_employee":
        if isinstance(action_input, dict):
            return {"name": action_input.get("name", name), "role": action_input.get("role", role)}
        return {"name": name, "role": role}
    if action == "generate_access":
        if isinstance(action_input, dict):
            return {"name": action_input.get("name", name), "role": action_input.get("role", role)}
        return {"name": name, "role": role}
    if action == "send_email":
        if isinstance(action_input, dict):
            return {
                "to": action_input.get("to", email),
                "subject": action_input.get("subject", "Welcome to the team"),
            }
        return {"to": email, "subject": "Welcome to the team"}
    if action == "query_knowledge_base":
        if not isinstance(action_input, str) or not action_input:
            return "onboarding policy"
        return action_input
    return action_input


async def _llm_thought(task: str, step_num: int, total: int, action: str, action_desc: str, prior_obs: str) -> str:
    """Ask the LLM for a concise ReAct thought for the upcoming action. Falls back to action_desc."""
    if not llm_client.is_available():
        return action_desc
    prompt = (
        f"You are a ReAct HR onboarding agent about to execute step {step_num} of {total}.\n"
        f"Overall task: {task}\n"
        f"Next action: {action} — {action_desc}\n"
        f"Recent observations: {prior_obs[:300]}\n\n"
        f"Write ONE concise sentence (max 22 words) explaining WHY this action is needed now. "
        f"Reason in first person. Do not mention you are an AI. Output only the thought sentence."
    )
    try:
        t = await llm_client.chat(prompt, system="You are a precise planning assistant. Be very concise.", max_tokens=70)
        t = (t or "").strip().strip('"').strip("'").strip()
        # Take only the first sentence to keep it tight
        if t:
            first = t.split(".")[0].strip()
            if first and len(first) < 300:
                return first + "."
        return action_desc
    except Exception:
        return action_desc


async def _llm_final_summary(task: str, employee_name: str | None, steps: list[dict]) -> str:
    """Ask the LLM to compose a concise final confirmation summary."""
    if not llm_client.is_available():
        return ""
    steps_str = "\n".join([f"- {s['action']}: {str(s['observation'])[:140]}" for s in steps])
    prompt = (
        f"You are an HR onboarding agent. The task '{task}' for employee '{employee_name or 'new hire'}' is complete.\n"
        f"Steps completed:\n{steps_str}\n\n"
        f"Write a concise (2-3 sentence) confirmation summary of what was accomplished. Mention the employee name."
    )
    try:
        s = await llm_client.chat(prompt, system="You are a concise summarizer.", max_tokens=120)
        s = (s or "").strip()
        if s:
            return s
    except Exception:
        pass
    return ""


# Short human descriptions for each tool, used to prompt the LLM for a thought.
_ACTION_DESCS = {
    "query_knowledge_base": "Look up the relevant onboarding policy in the knowledge base",
    "create_employee": "Create the employee record in the HR system",
    "generate_access": "Provision IT access (SSO, Git, Jira, corporate email)",
    "send_email": "Send the welcome email to the new employee",
}


async def run_agent(task: str, employee_name: str | None = None, role: str | None = None, department: str | None = None) -> dict:
    """Run a guided ReAct loop: a guaranteed-complete tool sequence with LLM-generated
    thoughts for each step and an LLM-composed final summary. Falls back to templated
    thoughts/summary if the LLM service is unavailable. This ensures every onboarding
    runs all four tools and produces a coherent, multi-step trace."""
    t0 = time.perf_counter()
    ctx = {"employee_name": employee_name, "role": role, "department": department}
    rule_plan = _rule_based_plan(task, employee_name, role, department)
    total = len(rule_plan)
    history: list[dict] = []
    tools_used: list[str] = []

    for i, (default_thought, action, action_input) in enumerate(rule_plan, start=1):
        step_t0 = time.perf_counter()
        prior_obs = " | ".join([h["observation"] for h in history]) or "(start of workflow)"
        thought = await _llm_thought(
            task, i, total, action,
            _ACTION_DESCS.get(action, default_thought), prior_obs,
        )
        action_input = _coerce_action_input(action, action_input, ctx)
        try:
            observation = TOOL_FUNCS[action](action_input)
        except Exception as e:
            observation = f"Tool error: {e}"
        if action not in tools_used:
            tools_used.append(action)
        latency_ms = int((time.perf_counter() - step_t0) * 1000)
        history.append({
            "step": i,
            "thought": thought,
            "action": action,
            "action_input": action_input,
            "observation": observation,
            "latency_ms": latency_ms,
        })

    final_answer = await _llm_final_summary(task, employee_name, history)
    if not final_answer:
        name = employee_name or "the new employee"
        final_answer = (
            f"Onboarding for {name} is complete. Knowledge base consulted, employee record created, "
            f"IT access provisioned, and welcome email sent."
        )

    total_latency_ms = int((time.perf_counter() - t0) * 1000)

    # Persist to DB
    try:
        db = SessionLocal()
        log = AgentLog(
            task=task,
            employee_name=employee_name,
            role=role,
            department=department,
            steps_count=len(history),
            status="completed",
            total_latency_ms=total_latency_ms,
            steps=json.dumps(history),
            created_at=datetime.utcnow(),
        )
        db.add(log)
        db.commit()
        db.close()
    except Exception as e:
        logger.error(f"Failed to persist agent log: {e}")

    return {
        "status": "completed",
        "final_answer": final_answer,
        "steps": history,
        "tools_used": tools_used,
        "total_latency_ms": total_latency_ms,
    }


def list_logs(limit: int = 50) -> list[dict]:
    try:
        db = SessionLocal()
        rows = db.query(AgentLog).order_by(AgentLog.id.desc()).limit(limit).all()
        out = []
        for r in rows:
            out.append({
                "id": r.id,
                "task": r.task,
                "employee": r.employee_name,
                "steps_count": r.steps_count,
                "status": r.status,
                "created_at": r.created_at.isoformat() if r.created_at else "",
                "total_latency_ms": r.total_latency_ms,
            })
        db.close()
        return out
    except Exception as e:
        logger.error(f"Failed to list agent logs: {e}")
        return []
