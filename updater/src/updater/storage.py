from __future__ import annotations

from pathlib import Path

import boto3


class Storage:
    def download_file(self, bucket: str, key: str, destination: Path) -> None:
        raise NotImplementedError

    def upload_file(self, bucket: str, key: str, source: Path) -> None:
        raise NotImplementedError

    def upload_bytes(self, bucket: str, key: str, data: bytes) -> None:
        raise NotImplementedError

    @staticmethod
    def get(scheme: str) -> Storage:
        if scheme == "file":
            return LocalStorage()
        elif scheme == "s3":
            return S3Storage()

        raise ValueError


class LocalStorage(Storage):
    def download_file(self, bucket: str, key: str, destination: Path) -> None:
        source = LocalStorage.__resolve(bucket, key)
        destination.parent.mkdir(parents=True, exist_ok=True)
        source.copy(destination, preserve_metadata=True)

    def upload_file(self, bucket: str, key: str, source: Path) -> None:
        destination = LocalStorage.__resolve(bucket, key)
        destination.parent.mkdir(parents=True, exist_ok=True)
        source.copy(destination, preserve_metadata=True)

    def upload_bytes(self, bucket: str, key: str, data: bytes) -> None:
        destination = LocalStorage.__resolve(bucket, key)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)

    @staticmethod
    def __resolve(bucket: str, key: str) -> Path:
        return Path(bucket).joinpath(key)


class S3Storage(Storage):
    def __init__(self):
        self.__client = boto3.client("s3")

    def download_file(self, bucket: str, key: str, destination: Path) -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        self.__client.download_file(bucket, key, str(destination))

    def upload_file(self, bucket: str, key: str, source: Path) -> None:
        self.__client.upload_file(str(source), bucket, key)

    def upload_bytes(self, bucket: str, key: str, data: bytes) -> None:
        self.__client.put_object(Bucket=bucket, Key=key, Body=data)
