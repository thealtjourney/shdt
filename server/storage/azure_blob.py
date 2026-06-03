"""
AzureBlobStorage — backs the Storage interface with Azure Blob Storage.

Lazy-imports the Azure SDK so that local installs don't need it. To use:

    pip install azure-storage-blob azure-identity

Configuration:
    AZURE_STORAGE_ACCOUNT     account name
    AZURE_STORAGE_CONTAINER   blob container
    AZURE_STORAGE_KEY         (optional) shared key — prefer Managed Identity

When running in Azure (App Service, Container Apps, AKS, Functions) the
DefaultAzureCredential picks up the Managed Identity automatically.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import IO, Iterable

from .base import Storage, StorageError, StorageObject


class AzureBlobStorage(Storage):
    """Azure Blob backend. Imports azure-* lazily so install is optional."""

    def __init__(
        self,
        account: str | None = None,
        container: str | None = None,
        connection_string: str | None = None,
    ) -> None:
        self.account = account or os.environ.get("AZURE_STORAGE_ACCOUNT")
        self.container = container or os.environ.get("AZURE_STORAGE_CONTAINER")
        self.connection_string = connection_string or os.environ.get(
            "AZURE_STORAGE_CONNECTION_STRING"
        )
        if not self.container:
            raise StorageError("AZURE_STORAGE_CONTAINER is required")
        if not (self.account or self.connection_string):
            raise StorageError(
                "Provide AZURE_STORAGE_ACCOUNT (with Managed Identity) or "
                "AZURE_STORAGE_CONNECTION_STRING"
            )
        self._service = None
        self._container_client = None

    # --- Lazy SDK setup -------------------------------------------------

    def _client(self):  # pragma: no cover - exercised only in Azure
        if self._container_client is not None:
            return self._container_client
        try:
            from azure.storage.blob import BlobServiceClient
        except ImportError as e:
            raise StorageError(
                "azure-storage-blob is not installed; run "
                "`pip install azure-storage-blob azure-identity` to use AzureBlobStorage"
            ) from e
        if self.connection_string:
            self._service = BlobServiceClient.from_connection_string(self.connection_string)
        else:
            from azure.identity import DefaultAzureCredential
            url = f"https://{self.account}.blob.core.windows.net"
            self._service = BlobServiceClient(account_url=url, credential=DefaultAzureCredential())
        self._container_client = self._service.get_container_client(self.container)
        # Ensure container exists
        try:
            self._container_client.create_container()
        except Exception:
            pass
        return self._container_client

    # --- Storage interface ---------------------------------------------

    def put_bytes(self, key: str, data: bytes, *, content_type: str | None = None) -> StorageObject:  # pragma: no cover
        from azure.storage.blob import ContentSettings
        client = self._client().get_blob_client(key)
        settings = ContentSettings(content_type=content_type) if content_type else None
        client.upload_blob(data, overwrite=True, content_settings=settings)
        return StorageObject(key=key, size=len(data), content_type=content_type)

    def put_stream(self, key: str, stream: IO[bytes], *, content_type: str | None = None) -> StorageObject:  # pragma: no cover
        from azure.storage.blob import ContentSettings
        client = self._client().get_blob_client(key)
        settings = ContentSettings(content_type=content_type) if content_type else None
        client.upload_blob(stream, overwrite=True, content_settings=settings)
        # We don't easily know size from the stream-upload response
        props = client.get_blob_properties()
        return StorageObject(key=key, size=props.size, content_type=content_type)

    def get_bytes(self, key: str) -> bytes:  # pragma: no cover
        client = self._client().get_blob_client(key)
        return client.download_blob().readall()

    def open_stream(self, key: str) -> IO[bytes]:  # pragma: no cover
        # Azure SDK does not expose a true file-like, so we read all and wrap
        import io
        return io.BytesIO(self.get_bytes(key))

    def exists(self, key: str) -> bool:  # pragma: no cover
        return self._client().get_blob_client(key).exists()

    def delete(self, key: str) -> None:  # pragma: no cover
        try:
            self._client().delete_blob(key)
        except Exception:
            pass

    def list(self, prefix: str = "") -> Iterable[StorageObject]:  # pragma: no cover
        for blob in self._client().list_blobs(name_starts_with=prefix or None):
            yield StorageObject(
                key=blob.name,
                size=blob.size,
                last_modified=blob.last_modified,
                content_type=getattr(blob.content_settings, "content_type", None),
            )

    def url_for(self, key: str, *, expires_seconds: int = 600) -> str:  # pragma: no cover
        from azure.storage.blob import generate_blob_sas, BlobSasPermissions

        if not self.account:
            # Connection-string mode: extract account from the service client
            self._client()  # ensure init
            self.account = self._service.account_name  # type: ignore[union-attr]

        # Use user-delegation SAS where possible (Managed Identity).
        try:
            udk = self._service.get_user_delegation_key(  # type: ignore[union-attr]
                key_start_time=datetime.now(timezone.utc),
                key_expiry_time=datetime.now(timezone.utc) + timedelta(seconds=expires_seconds),
            )
            sas = generate_blob_sas(
                account_name=self.account,
                container_name=self.container,
                blob_name=key,
                user_delegation_key=udk,
                permission=BlobSasPermissions(read=True),
                expiry=datetime.now(timezone.utc) + timedelta(seconds=expires_seconds),
            )
        except Exception:
            sas = ""  # fallback: caller deals with auth itself
        url = f"https://{self.account}.blob.core.windows.net/{self.container}/{key}"
        return f"{url}?{sas}" if sas else url
