"""Storage abstraction: LocalFilesystem (dev) + AzureBlob (prod)."""
from .base import Storage, StorageObject, StorageError
from .local import LocalFilesystemStorage
from .azure_blob import AzureBlobStorage
from .factory import get_storage

__all__ = [
    "Storage",
    "StorageObject",
    "StorageError",
    "LocalFilesystemStorage",
    "AzureBlobStorage",
    "get_storage",
]
