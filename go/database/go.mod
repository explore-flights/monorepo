module github.com/explore-flights/monorepo/go/database

go 1.25

require (
	github.com/aws/aws-sdk-go-v2 v1.39.6
	github.com/aws/aws-sdk-go-v2/config v1.31.17
	github.com/aws/aws-sdk-go-v2/service/s3 v1.90.0
	github.com/duckdb/duckdb-go/v2 v2.5.1
	github.com/explore-flights/monorepo/go/common v0.0.0
	github.com/google/cel-go v0.26.1
)

require (
	cel.dev/expr v0.25.0 // indirect
	github.com/antlr4-go/antlr/v4 v4.13.1 // indirect
	github.com/apache/arrow-go/v18 v18.4.1 // indirect
	github.com/aws/aws-sdk-go-v2/aws/protocol/eventstream v1.7.3 // indirect
	github.com/aws/aws-sdk-go-v2/credentials v1.18.21 // indirect
	github.com/aws/aws-sdk-go-v2/feature/ec2/imds v1.18.13 // indirect
	github.com/aws/aws-sdk-go-v2/internal/configsources v1.4.13 // indirect
	github.com/aws/aws-sdk-go-v2/internal/endpoints/v2 v2.7.13 // indirect
	github.com/aws/aws-sdk-go-v2/internal/ini v1.8.4 // indirect
	github.com/aws/aws-sdk-go-v2/internal/v4a v1.4.13 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/accept-encoding v1.13.3 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/checksum v1.9.4 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/presigned-url v1.13.13 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/s3shared v1.19.13 // indirect
	github.com/aws/aws-sdk-go-v2/service/sso v1.30.1 // indirect
	github.com/aws/aws-sdk-go-v2/service/ssooidc v1.35.5 // indirect
	github.com/aws/aws-sdk-go-v2/service/sts v1.39.1 // indirect
	github.com/aws/smithy-go v1.23.2 // indirect
	github.com/duckdb/duckdb-go-bindings v0.1.22 // indirect
	github.com/duckdb/duckdb-go-bindings/darwin-amd64 v0.1.22 // indirect
	github.com/duckdb/duckdb-go-bindings/darwin-arm64 v0.1.22 // indirect
	github.com/duckdb/duckdb-go-bindings/linux-amd64 v0.1.22 // indirect
	github.com/duckdb/duckdb-go-bindings/linux-arm64 v0.1.22 // indirect
	github.com/duckdb/duckdb-go-bindings/windows-amd64 v0.1.22 // indirect
	github.com/duckdb/duckdb-go/arrowmapping v0.0.24 // indirect
	github.com/duckdb/duckdb-go/mapping v0.0.24 // indirect
	github.com/go-viper/mapstructure/v2 v2.4.0 // indirect
	github.com/goccy/go-json v0.10.5 // indirect
	github.com/google/flatbuffers v25.9.23+incompatible // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/klauspost/compress v1.18.1 // indirect
	github.com/klauspost/cpuid/v2 v2.3.0 // indirect
	github.com/pierrec/lz4/v4 v4.1.22 // indirect
	github.com/stoewer/go-strcase v1.3.1 // indirect
	github.com/zeebo/xxh3 v1.0.2 // indirect
	golang.org/x/exp v0.0.0-20251023183803-a4bb9ffd2546 // indirect
	golang.org/x/mod v0.29.0 // indirect
	golang.org/x/sync v0.17.0 // indirect
	golang.org/x/sys v0.37.0 // indirect
	golang.org/x/telemetry v0.0.0-20251106204201-5cc343d36a5d // indirect
	golang.org/x/tools v0.38.0 // indirect
	golang.org/x/xerrors v0.0.0-20240903120638-7835f813f4da // indirect
	google.golang.org/genproto/googleapis/api v0.0.0-20251103181224-f26f9409b101 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20251103181224-f26f9409b101 // indirect
	google.golang.org/protobuf v1.36.10 // indirect
)

replace github.com/explore-flights/monorepo/go/common v0.0.0 => ../common
