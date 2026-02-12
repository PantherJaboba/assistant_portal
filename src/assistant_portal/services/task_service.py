import logging
from typing import List, Optional
from assistant_portal.domain.task_models import Task, TaskCreate

logger = logging.getLogger("assistant.tasks")

class TaskService:
    def __init__(self, repo):
        self.repo = repo

    async def create_task(self, data: TaskCreate) -> Task:
        logger.info("task.create", extra={"category": "tasks", "event": "task.create", "title": data.title})
        return await self.repo.create(data)

    async def get_task(self, task_id: str) -> Optional[Task]:
        return await self.repo.get(task_id)

    async def list_tasks(self) -> List[Task]:
        return await self.repo.list()