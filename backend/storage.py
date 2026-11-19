"""Image upload + serving, stored directly in MongoDB.

Owns its own `APIRouter` (mounted under `/api`) for upload endpoints. Image
bytes live in the `upload_blobs` collection (max 10 MB each, well under
MongoDB's 16 MB document limit); metadata lives in `uploads` as before, so
existing `/api/uploads/<id>` URLs keep the same shape.
"""
import uuid
from datetime import datetime, timezone

from bson import Binary
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile

from deps import (
    db, logger, ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES, get_current_user,
)

router = APIRouter()


def init_storage() -> None:
    """Kept for compatibility with the startup hook; nothing to initialise."""
    return None


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
    try:
        await db.upload_blobs.insert_one({"id": file_id, "data": Binary(data)})
    except Exception as exc:
        logger.error(f"Storage upload failed: {exc}")
        raise HTTPException(status_code=502, detail="Storage backend unavailable")
    record = {
        "id": file_id,
        "storage_path": f"mongo:{file_id}",
        "original_filename": file.filename or f"{file_id}.{ext}",
        "content_type": ct,
        "size": len(data),
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
    blob = await db.upload_blobs.find_one({"id": file_id})
    if not blob:
        raise HTTPException(status_code=404, detail="Upload data missing")
    return Response(
        content=bytes(blob["data"]),
        media_type=record.get("content_type") or "application/octet-stream",
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
