from __future__ import annotations

from pathlib import Path
import re
import uuid

from .config import settings

SAFE_KEY_RE = re.compile(r"^[a-zA-Z0-9_.-]+$")

ALLOWED_SIGNATURES: list[tuple[str, bytes]] = [
    ("image/png", b"\x89PNG\r\n\x1a\n"),
    ("image/jpeg", b"\xff\xd8\xff"),
    ("application/pdf", b"%PDF-"),
]

EXT_FOR_MIME = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "application/pdf": ".pdf",
}


class StorageSecurityError(ValueError):
    pass


class LocalPrivateStorage:
    """
    Stores sensitive user residential floor plans in a private, non-directory-listed
    folder with UUID storage keys and strict path traversal protection.
    """

    def __init__(self, base_dir: str | None = None) -> None:
        self.root = Path(base_dir or settings.local_storage_dir).resolve()
        (self.root / "floorplans").mkdir(parents=True, exist_ok=True)

    def detect_and_validate_file(self, raw_bytes: bytes, max_mb: int) -> str:
        max_bytes = max_mb * 1024 * 1024
        if len(raw_bytes) == 0:
            raise ValueError("Uploaded file is empty.")
        if len(raw_bytes) > max_bytes:
            raise OverflowError(f"File exceeds maximum allowed size of {max_mb} MB.")

        for mime, magic in ALLOWED_SIGNATURES:
            if raw_bytes.startswith(magic):
                return mime
        raise ValueError("Unsupported file format. Only PNG, JPG/JPEG, and PDF floor plans are accepted.")

    def save_floorplan(self, raw_bytes: bytes, mime_type: str) -> str:
        ext = EXT_FOR_MIME.get(mime_type, ".bin")
        key = f"fp_{uuid.uuid4().hex}{ext}"
        dest = self._resolve_safe_path(key)
        dest.write_bytes(raw_bytes)
        return key

    def read_floorplan(self, storage_key: str) -> bytes:
        path = self._resolve_safe_path(storage_key)
        if not path.is_file():
            raise FileNotFoundError(f"Floor plan blob not found: {storage_key}")
        return path.read_bytes()

    def _resolve_safe_path(self, storage_key: str) -> Path:
        if not SAFE_KEY_RE.match(storage_key) or ".." in storage_key:
            raise StorageSecurityError("Disallowed storage key characters.")
        floorplan_dir = (self.root / "floorplans").resolve()
        candidate = (floorplan_dir / storage_key).resolve()
        if candidate.parent != floorplan_dir:
            raise StorageSecurityError("Path traversal blocked.")
        return candidate


storage_service = LocalPrivateStorage()
