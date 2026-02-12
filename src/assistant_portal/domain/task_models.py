from __future__ import annotations
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime
from typing import Optional
import uuid

class TaskStatus(str, Enum):
    open = "open"
    done = "done"

class TaskPriority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"

class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    body: Optional[str] = Field(default=None, max_length=4000)
    due_at: Optional[datetime] = None
    priority: TaskPriority = TaskPriority.medium

class Task(TaskCreate):
    id: str
    status: TaskStatus = TaskStatus.open
    created_at: datetime
    updated_at: datetime

def new_task_id() -> str:
    return str(uuid.uuid4())