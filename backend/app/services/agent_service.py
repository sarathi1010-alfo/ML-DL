"""Tutor Agent service — Level 6 (Agentic AI).

Guided ReAct loop with 5 tools:
  1. assess_proficiency     — calls proficiency_service
  2. recommend_content      — recommends exercises based on weakest areas
  3. generate_exercise      — calls LLM to generate a practice exercise
  4. schedule_practice      — creates a weekly study schedule
  5. set_milestones         — sets learning milestones

LLM generates per-step thoughts + a final summary. Falls back to templated
thoughts when LLM is unavailable.
"""
from __future__ import annotations
import asyncio
import json
import re
import time
from typing import Any

from ..core.logging import logger
from .llm_client import llm_client
from .proficiency_service import ProficiencyService, CEFR_LEVELS, RECOMMENDATIONS
from .safety_service import safety_service


SYSTEM_PROMPT = (
    "You are MediLingua-Tutor, an agentic language-learning coach for medical professionals. "
    "You design personalized learning paths by calling tools in sequence and composing a clear "
    "final summary. Always be encouraging, clinically relevant, and practical."
)


class TutorAgentService:
    """Singleton tutor agent."""

    def __init__(self, proficiency: ProficiencyService | None = None) -> None:
        self._proficiency = proficiency

    @property
    def proficiency(self) -> ProficiencyService:
        if self._proficiency is None:
            self._proficiency = ProficiencyService()
        return self._proficiency

    # ---------- public ----------
    def run(self, payload: dict, db=None) -> dict:
        t0 = time.perf_counter()
        learner_id = payload.get("learner_id", "L001")
        task = payload.get("task", "Design learning path")
        current_level = payload.get("current_level", "B1")
        target_level = payload.get("target_level", "C1")
        specialty = payload.get("specialty", "general")

        scores = {
            "vocabulary_score": float(payload.get("vocabulary_score", 70)),
            "grammar_score": float(payload.get("grammar_score", 70)),
            "fluency_score": float(payload.get("fluency_score", 70)),
            "comprehension_score": float(payload.get("comprehension_score", 70)),
            "exercises_completed": float(payload.get("exercises_completed", 30)),
            "study_hours": float(payload.get("study_hours", 60)),
            "days_active": float(payload.get("days_active", 20)),
            "specialty": specialty,
        }

        steps: list[dict] = []
        tools_used: list[str] = []
        step_no = 0

        # Step 1: assess_proficiency
        step_no += 1
        t1 = time.perf_counter()
        prof_result = self.proficiency.predict(scores)
        observation_1 = (
            f"Predicted CEFR level: {prof_result['level']} (numeric {prof_result['level_numeric']}); "
            f"confidence {prof_result['confidence']:.2f}. "
            f"Top weakness areas: "
            + ", ".join(r["area"] for r in prof_result["recommendations"][:2])
            + "."
        )
        steps.append({
            "step": step_no,
            "thought": self._thought_for_step(step_no, current_level, target_level, specialty, prof_result),
            "action": "assess_proficiency",
            "action_input": {"scores": scores, "current_level": current_level},
            "observation": observation_1,
            "latency_ms": int((time.perf_counter() - t1) * 1000),
        })
        tools_used.append("assess_proficiency")

        # Step 2: recommend_content
        step_no += 1
        t1 = time.perf_counter()
        rec_content = self._tool_recommend_content(prof_result, specialty)
        observation_2 = (
            f"Recommended {len(rec_content['items'])} content items focused on "
            f"{rec_content['focus_areas']}: " +
            "; ".join(f"{it['title']} ({it['type']}, {it['difficulty']})" for it in rec_content["items"])
            + "."
        )
        steps.append({
            "step": step_no,
            "thought": self._thought_for_step(step_no, current_level, target_level, specialty, prof_result, rec_content),
            "action": "recommend_content",
            "action_input": {"current_level": prof_result["level"], "focus_areas": rec_content["focus_areas"]},
            "observation": observation_2,
            "latency_ms": int((time.perf_counter() - t1) * 1000),
        })
        tools_used.append("recommend_content")

        # Step 3: generate_exercise
        step_no += 1
        t1 = time.perf_counter()
        exercise = self._tool_generate_exercise(prof_result, specialty, target_level)
        observation_3 = (
            f"Generated exercise: '{exercise['title']}' ({exercise['type']}, {exercise['difficulty']}). "
            f"Focus: {exercise['focus']}. Estimated time: {exercise['estimated_minutes']} min."
        )
        steps.append({
            "step": step_no,
            "thought": self._thought_for_step(step_no, current_level, target_level, specialty, prof_result, exercise=exercise),
            "action": "generate_exercise",
            "action_input": {"focus_area": exercise["focus"], "type": exercise["type"], "level": prof_result["level"]},
            "observation": observation_3,
            "latency_ms": int((time.perf_counter() - t1) * 1000),
        })
        tools_used.append("generate_exercise")

        # Step 4: schedule_practice
        step_no += 1
        t1 = time.perf_counter()
        schedule = self._tool_schedule_practice(prof_result, target_level, scores)
        observation_4 = (
            f"Created {len(schedule['weekly_slots'])}-session weekly schedule. "
            f"Total study commitment: {schedule['weekly_minutes']} min/week. "
            f"Estimated days to reach {target_level}: {schedule['estimated_days']}."
        )
        steps.append({
            "step": step_no,
            "thought": self._thought_for_step(step_no, current_level, target_level, specialty, prof_result, schedule=schedule),
            "action": "schedule_practice",
            "action_input": {"weekly_minutes": schedule["weekly_minutes"], "estimated_days": schedule["estimated_days"]},
            "observation": observation_4,
            "latency_ms": int((time.perf_counter() - t1) * 1000),
        })
        tools_used.append("schedule_practice")

        # Step 5: set_milestones
        step_no += 1
        t1 = time.perf_counter()
        milestones = self._tool_set_milestones(prof_result["level"], target_level, schedule["estimated_days"])
        observation_5 = (
            f"Set {len(milestones['milestones'])} milestones: " +
            "; ".join(f"Week {m['week']} — {m['goal']} ({m['assessment']})" for m in milestones["milestones"])
            + "."
        )
        steps.append({
            "step": step_no,
            "thought": self._thought_for_step(step_no, current_level, target_level, specialty, prof_result, milestones=milestones, final=True),
            "action": "set_milestones",
            "action_input": {"milestones_count": len(milestones["milestones"]), "final_level": target_level},
            "observation": observation_5,
            "latency_ms": int((time.perf_counter() - t1) * 1000),
        })
        tools_used.append("set_milestones")

        # Final answer
        final_answer = self._compose_final_answer(
            learner_id, current_level, target_level, specialty,
            prof_result, rec_content, exercise, schedule, milestones,
        )

        learning_path = {
            "total_steps": len(steps),
            "estimated_days": schedule["estimated_days"],
            "focus_areas": rec_content["focus_areas"],
        }

        total_latency_ms = int((time.perf_counter() - t0) * 1000)

        # Safety screening — screen the LLM-composed final answer.
        screened = safety_service.screen(final_answer, context="agent")
        final_answer = screened["filtered_text"]
        safety_info = {
            "verdict": screened["verdict"],
            "confidence": screened["confidence"],
            "reasons": screened["reasons"],
            "disclaimers": screened["disclaimers"],
            "latency_ms": screened["latency_ms"],
        }

        # Persist agent log
        if db is not None:
            try:
                from ..models.agent_log import AgentLog
                from datetime import datetime
                log = AgentLog(
                    learner_id=learner_id,
                    task=task,
                    current_level=current_level,
                    target_level=target_level,
                    specialty=specialty,
                    steps_count=len(steps),
                    status="completed",
                    total_latency_ms=total_latency_ms,
                    steps=json.dumps(steps, default=str),
                    final_answer=final_answer,
                    created_at=datetime.utcnow(),
                )
                db.add(log)
                db.commit()
            except Exception as e:
                logger.warning(f"Failed to persist agent log: {e}")

        return {
            "status": "completed",
            "learning_path": learning_path,
            "steps": steps,
            "final_answer": final_answer,
            "tools_used": tools_used,
            "total_latency_ms": total_latency_ms,
            "safety": safety_info,
        }

    # ---------- tools ----------
    def _tool_recommend_content(self, prof_result: dict, specialty: str) -> dict:
        recs = prof_result.get("recommendations", [])
        # Top 2 focus areas (lowercased)
        focus_areas = [r["area"].lower() for r in recs[:2]]
        items: list[dict] = []
        type_map = {"grammar": "grammar drills", "vocabulary": "terminology cards",
                    "fluency": "role-play", "comprehension": "case reading",
                    "study habits": "study skills"}
        difficulty = "intermediate" if prof_result["level_numeric"] <= 4 else "advanced"
        for area in focus_areas:
            items.append({
                "title": f"{area.title()} for {specialty.title()} — Module {len(items) + 1}",
                "type": type_map.get(area, "exercise"),
                "difficulty": difficulty,
                "duration_min": 25,
            })
        if not focus_areas:
            focus_areas = ["vocabulary", "grammar"]
            items = [{
                "title": f"Foundational {specialty.title()} Vocabulary",
                "type": "terminology cards", "difficulty": "beginner", "duration_min": 20,
            }]
        return {"focus_areas": focus_areas, "items": items}

    def _tool_generate_exercise(self, prof_result: dict, specialty: str, target_level: str) -> dict:
        recs = prof_result.get("recommendations", [])
        focus = recs[0]["area"].lower() if recs else "grammar"
        title = f"{specialty.title()} {focus.title()} Practice — CEFR {target_level}"
        ex_type = "fill-in-the-blank" if focus == "grammar" else "role-play" if focus == "fluency" else "case-based discussion"
        difficulty = "intermediate" if prof_result["level_numeric"] <= 4 else "advanced"
        # Try LLM for a richer exercise title
        try:
            prompt = (
                f"In one short sentence, design a {focus} practice exercise for a "
                f"{specialty} learner at CEFR {prof_result['level']} working toward {target_level}. "
                f"Return only the exercise title."
            )
            llm_resp = asyncio.run(llm_client.chat(prompt, system=SYSTEM_PROMPT, max_tokens=80))
            if llm_resp and 5 < len(llm_resp) < 200:
                llm_resp = llm_resp.strip().strip("\"'.").strip()
                title = llm_resp[:200]
        except Exception:
            pass
        return {
            "title": title,
            "type": ex_type,
            "difficulty": difficulty,
            "focus": focus,
            "estimated_minutes": 20,
        }

    def _tool_schedule_practice(self, prof_result: dict, target_level: str, scores: dict) -> dict:
        # Days to next level: heuristic
        current_n = prof_result["level_numeric"]
        target_n = CEFR_LEVELS.index(target_level) + 1 if target_level in CEFR_LEVELS else 5
        gap = max(1, target_n - current_n)
        # Base 30 days per gap, scaled by study habits
        study_factor = 1.0
        if scores.get("study_hours", 0) > 100:
            study_factor = 0.8
        elif scores.get("days_active", 0) < 20:
            study_factor = 1.2
        estimated_days = int(30 * gap * study_factor)
        weekly_slots = [
            {"day": "Mon", "minutes": 30, "focus": "grammar"},
            {"day": "Wed", "minutes": 30, "focus": "vocabulary"},
            {"day": "Fri", "minutes": 45, "focus": "fluency (role-play)"},
            {"day": "Sat", "minutes": 30, "focus": "comprehension"},
        ]
        weekly_minutes = sum(s["minutes"] for s in weekly_slots)
        return {"weekly_slots": weekly_slots, "weekly_minutes": weekly_minutes, "estimated_days": estimated_days}

    def _tool_set_milestones(self, current_level: str, target_level: str, estimated_days: int) -> dict:
        current_n = CEFR_LEVELS.index(current_level) + 1 if current_level in CEFR_LEVELS else 3
        target_n = CEFR_LEVELS.index(target_level) + 1 if target_level in CEFR_LEVELS else 5
        milestones: list[dict] = []
        weeks_total = max(4, estimated_days // 7)
        for i, level_n in enumerate(range(current_n + 1, target_n + 1)):
            week = max(1, int(weeks_total * (i + 1) / max(1, (target_n - current_n))))
            milestones.append({
                "week": week,
                "goal": f"Reach {CEFR_LEVELS[level_n - 1]} proficiency",
                "assessment": f"Formal CEFR {CEFR_LEVELS[level_n - 1]} mock exam + tutor evaluation",
            })
        if not milestones:
            milestones.append({
                "week": weeks_total,
                "goal": f"Maintain {target_level} proficiency",
                "assessment": "End-of-program comprehensive exam",
            })
        return {"milestones": milestones}

    # ---------- thoughts (LLM with templated fallback) ----------
    def _thought_for_step(self, step: int, current: str, target: str, specialty: str,
                          prof_result: dict, rec_content: dict | None = None,
                          exercise: dict | None = None, schedule: dict | None = None,
                          milestones: dict | None = None, final: bool = False) -> str:
        templates = {
            1: (f"Learner {specialty} wants to progress from {current} to {target}. I'll first assess their "
                f"current proficiency to identify strengths and weaknesses."),
            2: (f"Proficiency is {prof_result['level']} (confidence {prof_result['confidence']:.2f}). "
                f"Now I'll recommend targeted content based on the weakest areas."),
            3: (f"Content plan ready. Next I'll generate a specific practice exercise aligned with the focus areas "
                f"and the learner's current level."),
            4: (f"Exercise ready. Now I'll build a realistic weekly practice schedule that fits the learner's "
                f"available time and projects days-to-mastery."),
            5: (f"Schedule set. Finally I'll establish measurable milestones so the learner can track progress "
                f"toward {target}."),
        }
        fallback = templates.get(step, f"Executing step {step}.")
        # Try LLM for a richer thought (short)
        try:
            ctx = (
                f"Learner: {specialty} specialist, CEFR {current} → target {target}. "
                f"Current assessment: level {prof_result['level']} (confidence {prof_result['confidence']:.2f}). "
            )
            if rec_content:
                ctx += f"Focus areas identified: {', '.join(rec_content['focus_areas'])}. "
            if exercise:
                ctx += f"Exercise generated: {exercise['title']}. "
            if schedule:
                ctx += f"Schedule: {schedule['weekly_minutes']} min/week, ~{schedule['estimated_days']} days to target. "
            if milestones:
                ctx += f"Milestones: {len(milestones['milestones'])} set. "
            prompt = (
                f"{ctx}\nAs MediLingua-Tutor, write ONE short thought (max 2 sentences) for step {step} of a "
                f"ReAct learning-path plan. Be specific and action-oriented. Return only the thought."
            )
            llm_resp = asyncio.run(llm_client.chat(prompt, system=SYSTEM_PROMPT, max_tokens=80))
            if llm_resp and 10 < len(llm_resp) < 300:
                return llm_resp.strip().strip("\"'").strip()
        except Exception:
            pass
        return fallback

    # ---------- final answer (LLM with templated fallback) ----------
    def _compose_final_answer(self, learner_id: str, current: str, target: str, specialty: str,
                              prof_result: dict, rec_content: dict, exercise: dict,
                              schedule: dict, milestones: dict) -> str:
        focus_list = ", ".join(rec_content["focus_areas"])
        mil_list = "; ".join(f"Week {m['week']}: {m['goal']}" for m in milestones["milestones"])
        fallback = (
            f"Personalized learning path designed for {learner_id} ({specialty}): "
            f"current CEFR {prof_result['level']} → target {target}. "
            f"Focus areas: {focus_list}. "
            f"Recommended content: {len(rec_content['items'])} module(s) including '{exercise['title']}'. "
            f"Practice schedule: {schedule['weekly_minutes']} min/week across {len(schedule['weekly_slots'])} sessions — "
            f"estimated {schedule['estimated_days']} days to reach {target}. "
            f"Milestones: {mil_list}. "
            f"Recommend weekly tutor review and quarterly re-assessment."
        )
        try:
            prompt = (
                f"Compose a concise, encouraging final summary (3-5 sentences) for learner {learner_id} "
                f"({specialty}) who is moving from CEFR {prof_result['level']} to {target}. "
                f"Include: focus areas ({focus_list}), key content ({exercise['title']}), "
                f"practice commitment ({schedule['weekly_minutes']} min/week for {schedule['estimated_days']} days), "
                f"and milestone structure. Return only the summary."
            )
            llm_resp = asyncio.run(llm_client.chat(prompt, system=SYSTEM_PROMPT, max_tokens=200))
            if llm_resp and 50 < len(llm_resp) < 800:
                return llm_resp.strip()
        except Exception:
            pass
        return fallback

    # ---------- logs ----------
    def list_logs(self, db, limit: int = 20) -> dict:
        from ..models.agent_log import AgentLog
        from sqlalchemy import select, func
        total = db.execute(select(func.count(AgentLog.id))).scalar() or 0
        rows = db.execute(
            select(AgentLog).order_by(AgentLog.id.desc()).limit(limit)
        ).scalars().all()
        out = []
        for r in rows:
            try:
                steps = json.loads(r.steps) if r.steps else []
            except Exception:
                steps = []
            out.append({
                "id": r.id,
                "learner_id": r.learner_id,
                "task": r.task,
                "current_level": r.current_level,
                "target_level": r.target_level,
                "specialty": r.specialty,
                "steps_count": r.steps_count,
                "status": r.status,
                "total_latency_ms": r.total_latency_ms,
                "steps": steps,
                "final_answer": r.final_answer or "",
                "created_at": r.created_at.isoformat() if r.created_at else "",
            })
        return {"logs": out, "total": int(total)}
