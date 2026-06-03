"""Factory: pick a storage backend from env."""
from __future__ import annotations

import os
import threading

from .base import Storage
from .local import LocalFilesystemStorage
from .azure_blob import AzureBlobStorage

_singleton: Storage | None = None
_lock = threading.Lock()


def get_storage() -> Storage:
    """
    Return the configured storage backend. Selected by STORAGE_BACKEND env:

        STORAGE_BACKEND=local      (default — uses STORAGE_LOCAL_DIR or ./storage)
        STORAGE_BACKEND=azure_blob (requires AZURE_STORAGE_* env vars)
    """
    global _singleton
    if _singleton is not None:
        return _singleton
    with _lock:
        if _singleton is None:
            backend = os.environ.get("STORAGE_BACKEND", "local").lower()
            if backend in ("azure", "azure_blob", "blob"):
                _singleton = AzureBlobStorage()
            else:
                base = os.environ.get(
                    "STORAGE_LOCAL_DIR",
                    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "storage_data"),
                )
                _singleton = LocalFilesystemStorage(base)
    return _singleton
