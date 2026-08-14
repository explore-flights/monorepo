# updater

Python implementation of the DuckDB updater workflow previously implemented in `go/database`.

## Data flow

```mermaid
sequenceDiagram
    autonumber

    participant EventBridge
    participant SFN as Step Functions
    participant Cron as Cron Lambda
    participant LH as Lufthansa API
    participant DataS3 as S3 data bucket
    participant Updater as DuckDB updater (ECS)
    participant ParquetS3 as S3 Parquet bucket
    participant Layer as Lambda layer
    participant API as API Lambda
    participant Consumer as API consumer

    Note over EventBridge,Layer: Daily data update

    EventBridge->>SFN: Start scheduled update
    SFN->>Cron: Load flight schedules

    loop Each requested date
        Cron->>LH: Request flight schedules
        LH-->>Cron: Return schedule JSON
        Cron->>DataS3: Store daily raw JSON
    end

    SFN->>Cron: Create update archive
    Cron->>DataS3: Read daily JSON files
    DataS3-->>Cron: Return raw schedules
    Cron->>DataS3: Store whole update as .tar.gz

    SFN->>Updater: Run database update
    Updater->>DataS3: Load update archive and flights.db
    DataS3-->>Updater: Return archive and database

    Updater->>Updater: Upsert schedules with DuckDB
    Updater->>DataS3: Store updated flights.db and basedata.db
    Updater->>ParquetS3: Store variants, connections and airport statistics
    Updater->>ParquetS3: Store partitioned history
    Updater->>ParquetS3: Store partitioned latest schedules
    Updater->>ParquetS3: Store partitioned update reports

    SFN->>Cron: Publish new data layer
    Cron->>DataS3: Read basedata.db
    DataS3-->>Cron: Return basedata.db
    Cron->>ParquetS3: Read variants, connections and airport statistics
    ParquetS3-->>Cron: Return Parquet files
    Cron->>Layer: Publish new layer version
    Cron->>API: Attach new layer version

    Note over Layer,Consumer: API request serving

    Consumer->>API: Request flight data
    API->>Layer: Read basedata, variants, connections and airport statistics
    Layer-->>API: Return local data
    API->>ParquetS3: Query history, latest or update reports
    ParquetS3-->>API: Return partitioned Parquet data
    API-->>Consumer: Return response
```

## Setup

```bash
uv sync
```

## Run

```bash
uv run updater --help
```

The CLI accepts the same updater flags used by the Go application:

- `--time`
- `--database-bucket`
- `--full-database-key`
- `--basedata-database-key`
- `--parquet-bucket`
- `--variants-key`
- `--report-key`
- `--connections-key`
- `--history-prefix`
- `--latest-prefix`
- `--input-bucket`
- `--input-key`
- `--update-summary-bucket`
- `--update-summary-key`
- `--skip-update-database`

Optional:

- `--parquet-uri-schema` (default `s3`, use `file` for local paths)
- `--aws-region` (default `eu-central-1`)
- `--log-level` (default `INFO`)

## Airport statistics derivative

`airport_statistics.parquet` contains one row per airport, direction, and local year. Each row has
the annual scheduled-leg, route, airline, aircraft-type, date-range, and duration summary together
with nested `route_statistics` and `daily_statistics` lists. Route records are grouped by other
airport, operating airline, and aircraft type. Daily records use the movement's local date.

The export counts current operating legs only, so marketing codeshares do not inflate the totals.
Arrival dates are derived from the departure timestamp, duration, and arrival UTC offset.
