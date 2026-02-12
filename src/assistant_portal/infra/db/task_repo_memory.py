from __future__ import annotations
from typing import Dict, List, Optional
from datetime import datetime, timezone

from assistant_portal.domain.task_models import Task, TaskCreate, new_task_id

class InMemoryTaskRepo:
    """
    In-memory store for Phase 1.
    Swap this later with SQLite/Postgres repo without touching routes.
    """
    def __init__(self):
        self._tasks: Dict[str, Task] = {}

    def create(self, data: TaskCreate) -> Task:
        now = datetime.now(timezone.utc)
        task = Task(
            id=new_task_id(),
            title=data.title,
            body=data.body,
            due_at=data.due_at,
            priority=data.priority,
            status="open",
            created_at=now,
            updated_at=now,
        )
        self._tasks[task.id] = task
        return task

    def get(self, task_id: str) -> Optional[Task]:
        return self._tasks.get(task_id)

    def list(self) -> List[Task]:
        # newest first
        return sorted(self._tasks.values(), key=lambda t: t.created_at, reverse=True)