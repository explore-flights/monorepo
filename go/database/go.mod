module github.com/explore-flights/monorepo/go/database

go 1.24

require (
	github.com/aws/aws-sdk-go-v2 v1.36.3
	github.com/aws/aws-sdk-go-v2/config v1.29.14
	github.com/aws/aws-sdk-go-v2/service/lambda v1.71.2
	github.com/aws/aws-sdk-go-v2/service/s3 v1.79.2
	github.com/aws/aws-sdk-go-v2/service/ssm v1.59.0
	github.com/explore-flights/monorepo/go/common v0.0.0
	github.com/marcboeker/go-duckdb/v2 v2.2.0
)

require (
	github.com/apache/arrow-go/v18 v18.1.0 // indirect
	github.com/aws/aws-sdk-go-v2/aws/protocol/eventstream v1.6.10 // indirect
	github.com/aws/aws-sdk-go-v2/credentials v1.17.67 // indirect
	github.com/aws/aws-sdk-go-v2/feature/ec2/imds v1.16.30 // indirect
	github.com/aws/aws-sdk-go-v2/internal/configsources v1.3.34 // indirect
	github.com/aws/aws-sdk-go-v2/internal/endpoints/v2 v2.6.34 // indirect
	github.com/aws/aws-sdk-go-v2/internal/ini v1.8.3 // indirect
	github.com/aws/aws-sdk-go-v2/internal/v4a v1.3.34 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/accept-encoding v1.12.3 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/checksum v1.7.0 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/presigned-url v1.12.15 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/s3shared v1.18.15 // indirect
	github.com/aws/aws-sdk-go-v2/service/sso v1.25.3 // indirect
	github.com/aws/aws-sdk-go-v2/service/ssooidc v1.30.1 // indirect
	github.com/aws/aws-sdk-go-v2/service/sts v1.33.19 // indirect
	github.com/aws/smithy-go v1.22.3 // indirect
	github.com/duckdb/duckdb-go-bindings v0.1.14 // indirect
	github.com/duckdb/duckdb-go-bindings/darwin-amd64 v0.1.9 // indirect
	github.com/duckdb/duckdb-go-bindings/darwin-arm64 v0.1.9 // indirect
	github.com/duckdb/duckdb-go-bindings/linux-amd64 v0.1.9 // indirect
	github.com/duckdb/duckdb-go-bindings/linux-arm64 v0.1.9 // indirect
	github.com/duckdb/duckdb-go-bindings/windows-amd64 v0.1.9 // indirect
	github.com/go-viper/mapstructure/v2 v2.2.1 // indirect
	github.com/goccy/go-json v0.10.5 // indirect
	github.com/google/flatbuffers v25.1.24+incompatible // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/klauspost/compress v1.17.11 // indirect
	github.com/klauspost/cpuid/v2 v2.2.9 // indirect
	github.com/marcboeker/go-duckdb/arrowmapping v0.0.7 // indirect
	github.com/marcboeker/go-duckdb/mapping v0.0.7 // indirect
	github.com/pierrec/lz4/v4 v4.1.22 // indirect
	github.com/zeebo/xxh3 v1.0.2 // indirect
	golang.org/x/exp v0.0.0-20250128182459-e0ece0dbea4c // indirect
	golang.org/x/mod v0.22.0 // indirect
	golang.org/x/sync v0.12.0 // indirect
	golang.org/x/sys v0.29.0 // indirect
	golang.org/x/tools v0.29.0 // indirect
	golang.org/x/xerrors v0.0.0-20240903120638-7835f813f4da // indirect
)

replace github.com/explore-flights/monorepo/go/common v0.0.0 => ../common
