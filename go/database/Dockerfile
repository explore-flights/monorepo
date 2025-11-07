FROM quay.io/pypa/manylinux_2_28_aarch64 AS build

ENV GOVERSION="1.25.4"
ENV GOOS="linux"
ENV GOARCH="arm64"

# install go
ADD "https://go.dev/dl/go$GOVERSION.$GOOS-$GOARCH.tar.gz" ./go.tar.gz
RUN tar -C /usr/local -xzf go.tar.gz && rm go.tar.gz
ENV PATH="$PATH:/usr/local/go/bin"

WORKDIR /build
COPY ../.. .

WORKDIR /build/database
RUN GOOS=linux CGO_ENABLED=1 go build -o database -tags "lambda"

FROM gcr.io/distroless/cc:nonroot

COPY --from=build --chown=nonroot:nonroot /build/database/database /usr/local/bin/database
USER nonroot

ENTRYPOINT ["/usr/local/bin/database"]