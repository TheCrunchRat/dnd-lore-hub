"""Image upload + serving via Emergent managed object storage.

Owns its own `APIRouter` (mounted under `/api`) for upload endpoints, plus the
private storage-client helpers. Initialised lazily on the first upload — the
startup hook calls `init_storage()` once with a forgiving wrapper.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

import requests
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile

from deps import (
    db, logger, APP_NAME, EMERGENT_LLM_KEY, STORAGE_URL,
    ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES, get_current_user,
)

router = APIRouter()

_storage_key: Optional[str] = None


def init_storage() -> str:
    global _storage_key
    if _storage_key:
        return _storage_key
    if not EMERGENT_LLM_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY is not configured")
    r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
    r.raise_for_status()
    _storage_key = r.json()["storage_key"]
    return _storage_key


def _storage_put(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    r = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    if r.status_code == 403:
        global _storage_key
        _storage_key = None
        key = init_storage()
        r = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120,
        )
    r.raise_for_status()
    return r.json()


def _storage_get(path: str):
    key = init_storage()
    r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if r.status_code == 403:
        global _storage_key
        _storage_key = None
        key = init_storage()
        r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")


@router.post("/uploads")
async def upload_image(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only the Lanternkeeper may upload")
    ct = (file.content_type or "").lower()
    if ct not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported image type: {ct or 'unknown'}")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large (max {MAX_UPLOAD_BYTES // (1024 * 1024)} MB)")
    ext = ALLOWED_IMAGE_TYPES[ct]
    file_id = uuid.uuid4().hex
    path = f"{APP_NAME}/uploads/{user['id']}/{file_id}.{ext}"
    try:
        result = _storage_put(path, data, ct)
    except Exception as exc:
        logger.error(f"Storage upload failed: {exc}")
        raise HTTPException(status_code=502, detail="Storage backend unavailable")
    record = {
        "id": file_id,
        "storage_path": result.get("path", path),
        "original_filename": file.filename or f"{file_id}.{ext}",
        "content_type": ct,
        "size": result.get("size", len(data)),
        "uploaded_by": user["id"],
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.uploads.insert_one(record)
    return {"id": file_id, "url": f"/api/uploads/{file_id}", "size": record["size"]}


@router.get("/uploads/{file_id}")
async def fetch_upload(file_id: str):
    record = await db.uploads.find_one({"id": file_id, "is_deleted": {"$ne": True}})
    if not record:
        raise HTTPException(status_code=404, detail="Upload not found")
    try:
        data, ct = _storage_get(record["storage_path"])
    except Exception as exc:
        logger.error(f"Storage fetch failed for {file_id}: {exc}")
        raise HTTPException(status_code=502, detail="Storage backend unavailable")
    return Response(
        content=data,
        media_type=record.get("content_type") or ct,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.delete("/uploads/{file_id}")
async def soft_delete_upload(file_id: str, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only the Lanternkeeper may delete uploads")
    r = await db.uploads.update_one({"id": file_id}, {"$set": {"is_deleted": True}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Upload not found")
    return {"ok": True}
