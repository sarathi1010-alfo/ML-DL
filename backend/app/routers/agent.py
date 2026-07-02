"""Agent (HR) router."""
from __future__ import annotations
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..deps import get_db, get_optional_user
from ..models.user import User
from ..schemas.agent import AgentRequest, AgentResponse, AgentLogsResponse, AgentLogOut
from ..services import agent_service

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/hr", response_model=AgentResponse)
async def agent_hr(req: AgentRequest, user: User = Depends(get_optional_user), db: Session = Depends(get_db)):
    result = await agent_service.run_agent(
        task=req.task,
        employee_name=req.employee_name,
        role=req.role,
        department=req.department,
    )
    return result


@router.get("/logs", response_model=AgentLogsResponse)
def agent_logs(limit: int = 50):
    logs = agent_service.list_logs(limit=limit)
    return AgentLogsResponse(logs=[AgentLogOut(**l) for l in logs])
