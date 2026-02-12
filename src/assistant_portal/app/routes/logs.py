from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/logs", tags=["logs"])


def _log_path() -> Path:
    log_dir = Path(os.getenv("LOG_DIR", "./logs"))
    return log_dir / "assistant.jsonl"


def _tail_lines(path: Path, n: int) -> list[str]:
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    return lines[-n:] if n > 0 else lines


@router.get("")
def get_logs(
    tail: int = 300,
    category: Optional[str] = None,
    level: Optional[str] = None,
    request_id: Optional[str] = None,
    q: Optional[str] = None,
):
    path = _log_path()
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Log file not found: {path}")

    tail = max(1, min(tail, 5000))
    raw = _tail_lines(path, tail)

    items = []
    for line in raw:
        try:
            obj = json.loads(line)
        except Exception:
            continue

        if category and obj.get("category") != category:
            continue
        if level and str(obj.get("level", "")).upper() != level.upper():
            continue
        if request_id and obj.get("request_id") != request_id:
            continue
        if q and q.lower() not in json.dumps(obj).lower():
            continue

        items.append(obj)

    return {"returned": len(items), "tail": tail, "items": items}