# syntax=docker/dockerfile:1

FROM golang:1.26-bookworm AS build

WORKDIR /src/api

COPY go/common/ /src/common/
COPY go/api/go.mod go/api/go.sum ./
RUN go mod download

COPY go/api/ ./
RUN CGO_ENABLED=1 go test -tags vps ./...
RUN CGO_ENABLED=1 go build \
    -tags vps \
    -trimpath \
    -ldflags="-s -w" \
    -o /out/explore-flights-api \
    .

FROM --platform=$BUILDPLATFORM public.ecr.aws/aws-cli/aws-cli:latest AS data

ARG AWS_REGION=eu-central-1
ARG VERSION
ARG PARQUET_BUCKET
ARG PARQUET_PREFIX
ARG DATA_BUCKET
ARG BASE_DATA_PATH

RUN test -n "${VERSION}" \
    && test -n "${PARQUET_BUCKET}" \
    && test -n "${PARQUET_PREFIX}" \
    && test -n "${DATA_BUCKET}" \
    && test -n "${BASE_DATA_PATH}"

RUN --mount=type=secret,id=AWS_ACCESS_KEY_ID,env=AWS_ACCESS_KEY_ID \
    --mount=type=secret,id=AWS_SECRET_ACCESS_KEY,env=AWS_SECRET_ACCESS_KEY \
    --mount=type=secret,id=AWS_SESSION_TOKEN,env=AWS_SESSION_TOKEN \
    mkdir -p /out/history /out/latest /out/updates_report \
    && aws s3 cp "s3://${DATA_BUCKET}/${BASE_DATA_PATH}" /out/basedata.db --only-show-errors \
    && aws s3 cp "s3://${PARQUET_BUCKET}/${PARQUET_PREFIX}variants.parquet" /out/variants.parquet --only-show-errors \
    && aws s3 cp "s3://${PARQUET_BUCKET}/${PARQUET_PREFIX}connections.parquet" /out/connections.parquet --only-show-errors \
    && aws s3 cp "s3://${PARQUET_BUCKET}/${PARQUET_PREFIX}airport_statistics.parquet" /out/airport_statistics.parquet --only-show-errors \
    && aws s3 cp "s3://${PARQUET_BUCKET}/${PARQUET_PREFIX}history/" /out/history/ --recursive --only-show-errors \
    && aws s3 cp "s3://${PARQUET_BUCKET}/${PARQUET_PREFIX}latest/" /out/latest/ --recursive --only-show-errors \
    && aws s3 cp "s3://${PARQUET_BUCKET}/${PARQUET_PREFIX}updates_report/" /out/updates_report/ --recursive --only-show-errors \
    && printf '%s' "${VERSION}" > /out/version.txt

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=65532:65532 /out/explore-flights-api /usr/local/bin/explore-flights-api
COPY --from=data --chown=65532:65532 /out/ /opt/data/

ENV PORT=8080

USER 65532:65532
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/explore-flights-api"]
