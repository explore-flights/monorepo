FROM golang:1.24 AS build

WORKDIR /build
COPY ../.. .

WORKDIR /build/database
RUN GOOS=linux CGO_ENABLED=1 go build -o database -tags "lambda"

FROM gcr.io/distroless/cc:nonroot

COPY --from=build --chown=nonroot:nonroot /build/database/database /usr/local/bin/database
USER nonroot

ENTRYPOINT ["/usr/local/bin/database"]