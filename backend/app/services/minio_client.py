import io
import json
from typing import Any

from minio import Minio
from minio.error import S3Error

from app.config import get_settings

settings = get_settings()

_client: Minio | None = None


def _get_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_root_user,
            secret_key=settings.minio_root_password,
            secure=settings.minio_secure,
        )
        # Ensure bucket exists
        if not _client.bucket_exists(settings.minio_bucket):
            _client.make_bucket(settings.minio_bucket)
    return _client


async def upload_json(key: str, data: Any) -> None:
    client = _get_client()
    payload = json.dumps(data, default=str).encode("utf-8")
    client.put_object(
        settings.minio_bucket,
        key,
        io.BytesIO(payload),
        length=len(payload),
        content_type="application/json",
    )


async def presigned_url(key: str, expires: int = 3600) -> str:
    from datetime import timedelta
    client = _get_client()
    return client.presigned_get_object(
        settings.minio_bucket, key, expires=timedelta(seconds=expires)
    )


async def download_json(key: str) -> Any:
    client = _get_client()
    try:
        response = client.get_object(settings.minio_bucket, key)
        return json.loads(response.read())
    except S3Error as exc:
        raise FileNotFoundError(f"MinIO key not found: {key}") from exc


async def delete_objects_by_prefix(prefix: str) -> int:
    """Delete all objects under the given prefix. Returns number of objects deleted."""
    from minio.deleteobjects import DeleteObject

    client = _get_client()
    objects = client.list_objects(settings.minio_bucket, prefix=prefix, recursive=True)
    delete_list = [DeleteObject(obj.object_name) for obj in objects]
    if not delete_list:
        return 0
    errors = list(client.remove_objects(settings.minio_bucket, delete_list))
    if errors:
        for err in errors:
            import logging
            logging.getLogger(__name__).warning("MinIO delete error: %s", err)
    return len(delete_list) - len(errors)
