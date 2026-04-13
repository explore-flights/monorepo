from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(frozen=True)
class Settings:
    time: datetime
    database_bucket: str
    full_database_key: str
    basedata_database_key: str
    parquet_bucket: str
    variants_key: str
    report_key: str
    connections_key: str
    history_prefix: str
    latest_prefix: str
    input_bucket: str
    input_key: str
    update_summary_bucket: str
    update_summary_key: str
    skip_update_database: bool

    def validate(self) -> None:
        if not self.skip_update_database and (not self.input_bucket or not self.input_key):
            raise ValueError("input bucket/key are required unless --skip-update-database is set")

        required = (
            self.database_bucket,
            self.full_database_key,
            self.basedata_database_key,
            self.parquet_bucket,
            self.variants_key,
            self.report_key,
            self.connections_key,
            self.history_prefix,
            self.latest_prefix,
        )
        if any(value == "" for value in required):
            raise ValueError("missing required updater arguments")

        if self.time.tzinfo is None:
            raise ValueError("--time must include timezone information")

    @property
    def time_utc(self) -> datetime:
        return self.time.astimezone(timezone.utc)
