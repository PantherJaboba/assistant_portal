from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional, List

from sqlalchemy import String, Text, DateTime, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.ext.asyncio import AsyncSession

from assistant_portal.domain.task_models import Task, TaskCreate, TaskStatus, TaskPriority, new_task_id


class Base(DeclarativeBase):
    pass


class TaskRow(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(140), nullable=False)
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    due_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    priority: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    def to_domain(self) -> Task:
        return Task(
            id=self.id,
            title=self.title,
            body=self.body,
            due_at=self.due_at,
            priority=TaskPriority(self.priority),
            status=TaskStatus(self.status),
            created_at=self.created_at,
            updated_at=self.updated_at,
        )


class SQLiteTaskRepo:
    def __init__(self, sessionmaker):
        self.sessionmaker = sessionmaker

    async def create(self, data: TaskCreate) -> Task:
        now = datetime.now(timezone.utc)
        row = TaskRow(
            id=new_task_id(),
            title=data.title,
            body=data.body,
            due_at=data.due_at,
            priority=data.priority.value,
            status=TaskStatus.open.value,
            created_at=now,
            updated_at=now,
        )
        async with self.sessionmaker() as session:
        # session is AsyncSession

            session.add(row)
            await session.commit()
            return row.to_domain()

    async def get(self, task_id: str) -> Optional[Task]:
        async with self.sessionmaker() as session:
            row = await session.get(TaskRow, task_id)
            return row.to_domain() if row else None

    async def list(self) -> List[Task]:
        async with self.sessionmaker() as session:
            res = await session.execute(select(TaskRow).order_by(TaskRow.created_at.desc()))
            rows = res.scalars().all()
            return [r.to_domain() for r in rows]