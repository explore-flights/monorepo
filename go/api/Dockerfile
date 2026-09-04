# syntax=docker/dockerfile:1

ARG APPLICATION_IMAGE=scratch
ARG DATA_IMAGE=scratch

FROM --platform=$BUILDPLATFORM ${DATA_IMAGE} AS data
FROM ${APPLICATION_IMAGE}

COPY --link --from=data --chown=65532:65532 /opt/data/ /opt/data/
