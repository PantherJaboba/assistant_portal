from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["logs"])


def _log_path() -> Path:
    log_dir = Path(os.getenv("LOG_DIR", "./logs"))
    return log_dir / "assistant.jsonl"


def _matches(obj: dict, category: Optional[str], level: Optional[str], request_id: Optional[str], q: Optional[str]) -> bool:
    if category and obj.get("category") != category:
        return False
    if level and str(obj.get("level", "")).upper() != level.upper():
        return False
    if request_id and obj.get("request_id") != request_id:
        return False
    if q and q.lower() not in json.dumps(obj).lower():
        return False
    return True


@router.websocket("/ws/logs")
async def ws_logs(
    websocket: WebSocket,
    tail: int = 200,
    category: Optional[str] = None,
    level: Optional[str] = None,
    request_id: Optional[str] = None,
    q: Optional[str] = None,
):
    await websocket.accept()

    path = _log_path()
    if not path.exists():
        await websocket.send_json({"type": "error", "message": f"Log file not found: {path}"})
        await websocket.close()
        return

    # Send initial tail
    tail = max(1, min(tail, 5000))
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()[-tail:]
        for line in lines:
            try:
                obj = json.loads(line)
            except Exception:
                continue
            if _matches(obj, category, level, request_id, q):
                await websocket.send_json({"type": "log", "item": obj})
    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})

    # Follow file changes (simple "tail -f")
    try:
        with path.open("r", encoding="utf-8", errors="replace") as f:
            # Move to end; we already sent tail above
            f.seek(0, os.SEEK_END)

            while True:
                line = f.readline()
                if not line:
                    await asyncio.sleep(0.25)
                    continue

                line = line.strip()
                if not line:
                    continue

                try:
                    obj = json.loads(line)
                except Exception:
                    continue

                if _matches(obj, category, level, request_id, q):
                    await websocket.send_json({"type": "log", "item": obj})
    except WebSocketDisconnect:
        return
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        finally:
            try:
                await websocket.close()
            except Exception:
                pass