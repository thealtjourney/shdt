"""
Storage interface — local filesystem in development, Azure Blob in production.

The interface is deliberately small and key/value oriented (object storage
semantics) rather than POSIX. That is the right shape for what SHDT does:
- cache the OS Open UPRN CSV
- cache the IoD 2025 CSV download
- store user-uploaded Excel files via the Data Hub
- store generated reports / PDFs / exports

Keys use forward slashes for hierarchy (e.g. "uploads/2026-04-29/repairs.xlsx").

Usage:

    from storage import get_storage
    storage = get_storage()
    storage.put_bytes("uploads/foo.xlsx", data, content_type="application/...")
    data = storage.get_bytes("uploads/foo.xlsx")
    for obj in storage.list("uploads/"):
        print(obj.key, obj.size)
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import IO, Iterable


class StorageError(Exception):
    """Base class for storage-layer errors."""


@dataclass(frozen=True)
class StorageObject:
    """Lightweight metadata for a stored object."""
    key: str
    size: int
    last_modified: datetime | None = None
    content_type: str | None = None


class Storage(ABC):
    """Abstract storage backend."""

    @abstractmethod
    def put_bytes(
        self,
        key: str,
        data: bytes,
        *,
        content_type: str | None = None,
    ) -> StorageObject:
        """Write bytes to a key. Overwrites if the key already exists."""

    @abstractmethod
    def put_stream(
        self,
        key: str,
        stream: IO[bytes],
        *,
        content_type: str | None = None,
    ) -> StorageObject:
        """Stream bytes from a file-like to a key (for large uploads)."""

    @abstractmethod
    def get_bytes(self, key: str) -> bytes:
        """Read all bytes at a key. Raises StorageError if missing."""

    @abstractmethod
    def open_stream(self, key: str) -> IO[bytes]:
        """Open a streaming read for large objects. Caller closes the handle."""

    @abstractmethod
    def exists(self, key: str) -> bool:
        ...

    @abstractmethod
    def delete(self, key: str) -> None:
        """Delete a key. Idempotent — missing keys are not an error."""

    @abstractmethod
    def list(self, prefix: str = "") -> Iterable[StorageObject]:
        """List objects whose key starts with `prefix`."""

    @abstractmethod
    def url_for(self, key: str, *, expires_seconds: int = 600) -> str:
        """
        Produce a URL to download the object directly. For local backends this
        may be a file:// URL or a relative path — callers should treat it as
        opaque. For Azure Blob it produces a SAS URL.
        """
