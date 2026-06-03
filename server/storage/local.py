"""LocalFilesystemStorage — backs the Storage interface with a local directory."""
from __future__ import annotations

import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import IO, Iterable

from .base import Storage, StorageError, StorageObject


class LocalFilesystemStorage(Storage):
    """
    Files live under a single base directory. Keys are joined to it as paths.
    Slashes in keys become directory separators.
    """

    def __init__(self, base_dir: str | os.PathLike[str]) -> None:
        self.base = Path(base_dir).resolve()
        self.base.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        # Refuse traversal
        if ".." in Path(key).parts:
            raise StorageError(f"Invalid key (traversal): {key!r}")
        p = (self.base / key).resolve()
        # Verify path is still inside base
        try:
            p.relative_to(self.base)
        except ValueError:
            raise StorageError(f"Resolved path escapes base: {key!r}")
        return p

    def put_bytes(self, key: str, data: bytes, *, content_type: str | None = None) -> StorageObject:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        return StorageObject(
            key=key,
            size=len(data),
            last_modified=datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc),
            content_type=content_type,
        )

    def put_stream(self, key: str, stream: IO[bytes], *, content_type: str | None = None) -> StorageObject:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        size = 0
        with p.open("wb") as out:
            while True:
                chunk = stream.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
                size += len(chunk)
        return StorageObject(
            key=key,
            size=size,
            last_modified=datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc),
            content_type=content_type,
        )

    def get_bytes(self, key: str) -> bytes:
        p = self._path(key)
        if not p.exists():
            raise StorageError(f"Key not found: {key!r}")
        return p.read_bytes()

    def open_stream(self, key: str) -> IO[bytes]:
        p = self._path(key)
        if not p.exists():
            raise StorageError(f"Key not found: {key!r}")
        return p.open("rb")

    def exists(self, key: str) -> bool:
        return self._path(key).exists()

    def delete(self, key: str) -> None:
        p = self._path(key)
        if p.is_dir():
            shutil.rmtree(p, ignore_errors=True)
        elif p.exists():
            p.unlink()

    def list(self, prefix: str = "") -> Iterable[StorageObject]:
        if prefix:
            start = self._path(prefix)
            if start.is_file():
                yield from self._meta_iter([start])
                return
            if not start.exists():
                return
        else:
            start = self.base
        for path in start.rglob("*"):
            if path.is_file():
                yield from self._meta_iter([path])

    def _meta_iter(self, paths):
        for p in paths:
            rel = p.relative_to(self.base).as_posix()
            stat = p.stat()
            yield StorageObject(
                key=rel,
                size=stat.st_size,
                last_modified=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
            )

    def url_for(self, key: str, *, expires_seconds: int = 600) -> str:
        # Local backend: return a file:// URL. Callers should treat as opaque.
        return self._path(key).as_uri()
