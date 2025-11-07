module github.com/explore-flights/monorepo/go/api

go 1.25

require (
	github.com/aws/aws-sdk-go-v2 v1.38.1
	github.com/aws/aws-sdk-go-v2/config v1.31.3
	github.com/aws/aws-sdk-go-v2/service/s3 v1.87.1
	github.com/aws/aws-sdk-go-v2/service/ssm v1.64.0
	github.com/duckdb/duckdb-go/v2 v2.5.1
	github.com/explore-flights/monorepo/go/common v0.0.0
	github.com/goccy/go-graphviz v0.2.9
	github.com/gofrs/uuid/v5 v5.3.2
	github.com/golang-jwt/jwt/v5 v5.3.0
	github.com/gorilla/feeds v1.2.0
	github.com/its-felix/aws-lwa-go-middleware v0.1.1
	github.com/json-iterator/go v1.1.12
	github.com/jxskiss/base62 v1.1.0
	github.com/labstack/echo/v4 v4.13.4
	github.com/stretchr/testify v1.11.0
	golang.org/x/sync v0.16.0
	golang.org/x/time v0.12.0
	google.golang.org/protobuf v1.36.8
)

require (
	github.com/apache/arrow-go/v18 v18.4.1 // indirect
	github.com/aws/aws-lambda-go v1.49.0 // indirect
	github.com/aws/aws-sdk-go-v2/aws/protocol/eventstream v1.7.0 // indirect
	github.com/aws/aws-sdk-go-v2/credentials v1.18.7 // indirect
	github.com/aws/aws-sdk-go-v2/feature/ec2/imds v1.18.4 // indirect
	github.com/aws/aws-sdk-go-v2/internal/configsources v1.4.4 // indirect
	github.com/aws/aws-sdk-go-v2/internal/endpoints/v2 v2.7.4 // indirect
	github.com/aws/aws-sdk-go-v2/internal/ini v1.8.3 // indirect
	github.com/aws/aws-sdk-go-v2/internal/v4a v1.4.4 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/accept-encoding v1.13.0 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/checksum v1.8.4 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/presigned-url v1.13.4 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/s3shared v1.19.4 // indirect
	github.com/aws/aws-sdk-go-v2/service/sso v1.28.2 // indirect
	github.com/aws/aws-sdk-go-v2/service/ssooidc v1.34.0 // indirect
	github.com/aws/aws-sdk-go-v2/service/sts v1.38.0 // indirect
	github.com/aws/smithy-go v1.22.5 // indirect
	github.com/davecgh/go-spew v1.1.2-0.20180830191138-d8f796af33cc // indirect
	github.com/disintegration/imaging v1.6.2 // indirect
	github.com/duckdb/duckdb-go-bindings v0.1.22 // indirect
	github.com/duckdb/duckdb-go-bindings/darwin-amd64 v0.1.22 // indirect
	github.com/duckdb/duckdb-go-bindings/darwin-arm64 v0.1.22 // indirect
	github.com/duckdb/duckdb-go-bindings/linux-amd64 v0.1.22 // indirect
	github.com/duckdb/duckdb-go-bindings/linux-arm64 v0.1.22 // indirect
	github.com/duckdb/duckdb-go-bindings/windows-amd64 v0.1.22 // indirect
	github.com/duckdb/duckdb-go/arrowmapping v0.0.24 // indirect
	github.com/duckdb/duckdb-go/mapping v0.0.24 // indirect
	github.com/flopp/go-findfont v0.1.0 // indirect
	github.com/fogleman/gg v1.3.0 // indirect
	github.com/go-jose/go-jose/v4 v4.1.2 // indirect
	github.com/go-viper/mapstructure/v2 v2.4.0 // indirect
	github.com/goccy/go-json v0.10.5 // indirect
	github.com/golang/freetype v0.0.0-20170609003504-e2365dfdc4a0 // indirect
	github.com/google/flatbuffers v25.2.10+incompatible // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/klauspost/compress v1.18.0 // indirect
	github.com/klauspost/cpuid/v2 v2.3.0 // indirect
	github.com/labstack/gommon v0.4.2 // indirect
	github.com/mattn/go-colorable v0.1.14 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/modern-go/concurrent v0.0.0-20180306012644-bacd9c7ef1dd // indirect
	github.com/modern-go/reflect2 v1.0.2 // indirect
	github.com/pierrec/lz4/v4 v4.1.22 // indirect
	github.com/pmezard/go-difflib v1.0.1-0.20181226105442-5d4384ee4fb2 // indirect
	github.com/tetratelabs/wazero v1.9.0 // indirect
	github.com/valyala/bytebufferpool v1.0.0 // indirect
	github.com/valyala/fasttemplate v1.2.2 // indirect
	github.com/zeebo/xxh3 v1.0.2 // indirect
	golang.org/x/crypto v0.41.0 // indirect
	golang.org/x/exp v0.0.0-20250819193227-8b4c13bb791b // indirect
	golang.org/x/image v0.30.0 // indirect
	golang.org/x/mod v0.27.0 // indirect
	golang.org/x/net v0.43.0 // indirect
	golang.org/x/sys v0.35.0 // indirect
	golang.org/x/text v0.28.0 // indirect
	golang.org/x/tools v0.36.0 // indirect
	golang.org/x/xerrors v0.0.0-20240903120638-7835f813f4da // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)

replace github.com/explore-flights/monorepo/go/common v0.0.0 => ../common
