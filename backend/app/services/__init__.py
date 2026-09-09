from __future__ import annotations

from pathlib import Path

from azure.storage.blob import ContentSettings
from fastapi import HTTPException

from app.config import get_settings


class Storage:
    def save(self, key: str, data: bytes, content_type: str) -> str:
        raise NotImplementedError

    def public_url(self, key: str) -> str:
        raise NotImplementedError

    def read(self, key: str) -> bytes:
        raise NotImplementedError


class LocalStorage(Storage):
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not str(path).startswith(str(self.root.resolve())):
            raise HTTPException(status_code=400, detail="Invalid storage key")
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def save(self, key: str, data: bytes, content_type: str) -> str:
        self._path(key).write_bytes(data)
        return key

    def public_url(self, key: str) -> str:
        return f"/api/media/{key}"

    def read(self, key: str) -> bytes:
        path = self._path(key)
        if not path.exists():
            raise HTTPException(status_code=404, detail="Media not found")
        return path.read_bytes()


class AzureBlobStorage(Storage):
    def __init__(self, connection_string: str, container: str) -> None:
        from azure.storage.blob import BlobServiceClient

        self.client = BlobServiceClient.from_connection_string(connection_string)
        self.container = container
        try:
            self.client.create_container(container)
        except Exception:
            pass

    def save(self, key: str, data: bytes, content_type: str) -> str:
        blob = self.client.get_blob_client(self.container, key)
        blob.upload_blob(
            data,
            overwrite=True,
            content_settings=ContentSettings(content_type=content_type),
        )
        return key

    def public_url(self, key: str) -> str:
        blob = self.client.get_blob_client(self.container, key)
        return blob.url

    def read(self, key: str) -> bytes:
        blob = self.client.get_blob_client(self.container, key)
        return blob.download_blob().readall()


def get_storage() -> Storage:
    settings = get_settings()
    if settings.azure_storage_connection_string:
        return AzureBlobStorage(
            settings.azure_storage_connection_string,
            settings.azure_storage_container,
        )
    return LocalStorage(settings.media_root)
