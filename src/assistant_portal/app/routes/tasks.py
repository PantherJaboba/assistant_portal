from fastapi import APIRouter, HTTPException
from assistant_portal.domain.task_models import Task, TaskCreate
from assistant_portal.services.task_service import TaskService

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def get_service() -> TaskService:
    # Overwritten in main.py:
    # tasks.get_service = lambda: svc
    raise RuntimeError("TaskService not wired")


@router.post("", response_model=Task)
async def create_task(payload: TaskCreate):
    svc = get_service()
    return await svc.create_task(payload)


@router.get("", response_model=list[Task])
async def list_tasks():
    svc = get_service()
    return await svc.list_tasks()


@router.get("/{task_id}", response_model=Task)
async def get_task(task_id: str):
    svc = get_service()
    task = await svc.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task