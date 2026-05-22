module github.com/explore-flights/monorepo/go/api

go 1.26

require (
	github.com/aws/aws-sdk-go-v2 v1.41.7
	github.com/aws/aws-sdk-go-v2/config v1.32.17
	github.com/aws/aws-sdk-go-v2/service/s3 v1.101.0
	github.com/aws/aws-sdk-go-v2/service/ssm v1.68.6
	github.com/duckdb/duckdb-go/v2 v2.10503.0
	github.com/explore-flights/monorepo/go/common v0.0.0
	github.com/goccy/go-graphviz v0.2.10
	github.com/gofrs/uuid/v5 v5.4.0
	github.com/golang-jwt/jwt/v5 v5.3.1
	github.com/gorilla/feeds v1.2.0
	github.com/its-felix/aws-lwa-go-middleware v0.1.1
	github.com/json-iterator/go v1.1.12
	github.com/jxskiss/base62 v1.1.0
	github.com/labstack/echo/v4 v4.15.2
	github.com/stretchr/testify v1.11.1
	golang.org/x/sync v0.20.0
	golang.org/x/time v0.15.0
	google.golang.org/protobuf v1.36.11
)

require (
	github.com/apache/arrow-go/v18 v18.6.0 // indirect
	github.com/aws/aws-lambda-go v1.54.0 // indirect
	github.com/aws/aws-sdk-go-v2/aws/protocol/eventstream v1.7.10 // indirect
	github.com/aws/aws-sdk-go-v2/credentials v1.19.16 // indirect
	github.com/aws/aws-sdk-go-v2/feature/ec2/imds v1.18.23 // indirect
	github.com/aws/aws-sdk-go-v2/internal/configsources v1.4.23 // indirect
	github.com/aws/aws-sdk-go-v2/internal/endpoints/v2 v2.7.23 // indirect
	github.com/aws/aws-sdk-go-v2/internal/v4a v1.4.24 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/accept-encoding v1.13.9 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/checksum v1.9.15 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/presigned-url v1.13.23 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/s3shared v1.19.23 // indirect
	github.com/aws/aws-sdk-go-v2/service/signin v1.0.11 // indirect
	github.com/aws/aws-sdk-go-v2/service/sso v1.30.17 // indirect
	github.com/aws/aws-sdk-go-v2/service/ssooidc v1.35.21 // indirect
	github.com/aws/aws-sdk-go-v2/service/sts v1.42.1 // indirect
	github.com/aws/smithy-go v1.25.1 // indirect
	github.com/davecgh/go-spew v1.1.2-0.20180830191138-d8f796af33cc // indirect
	github.com/disintegration/imaging v1.6.2 // indirect
	github.com/duckdb/duckdb-go-bindings v0.10503.0 // indirect
	github.com/duckdb/duckdb-go-bindings/lib/darwin-amd64 v0.10503.0 // indirect
	github.com/duckdb/duckdb-go-bindings/lib/darwin-arm64 v0.10503.0 // indirect
	github.com/duckdb/duckdb-go-bindings/lib/linux-amd64 v0.10503.0 // indirect
	github.com/duckdb/duckdb-go-bindings/lib/linux-arm64 v0.10503.0 // indirect
	github.com/duckdb/duckdb-go-bindings/lib/windows-amd64 v0.10503.0 // indirect
	github.com/flopp/go-findfont v0.1.0 // indirect
	github.com/fogleman/gg v1.3.0 // indirect
	github.com/go-jose/go-jose/v4 v4.1.4 // indirect
	github.com/go-viper/mapstructure/v2 v2.5.0 // indirect
	github.com/goccy/go-json v0.10.6 // indirect
	github.com/golang/freetype v0.0.0-20170609003504-e2365dfdc4a0 // indirect
	github.com/google/flatbuffers v25.12.19+incompatible // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/klauspost/compress v1.18.6 // indirect
	github.com/klauspost/cpuid/v2 v2.3.0 // indirect
	github.com/labstack/gommon v0.5.0 // indirect
	github.com/mattn/go-colorable v0.1.14 // indirect
	github.com/mattn/go-isatty v0.0.22 // indirect
	github.com/modern-go/concurrent v0.0.0-20180306012644-bacd9c7ef1dd // indirect
	github.com/modern-go/reflect2 v1.0.2 // indirect
	github.com/pierrec/lz4/v4 v4.1.26 // indirect
	github.com/pmezard/go-difflib v1.0.1-0.20181226105442-5d4384ee4fb2 // indirect
	github.com/tetratelabs/wazero v1.11.0 // indirect
	github.com/valyala/bytebufferpool v1.0.0 // indirect
	github.com/valyala/fasttemplate v1.2.2 // indirect
	github.com/zeebo/xxh3 v1.1.0 // indirect
	golang.org/x/crypto v0.52.0 // indirect
	golang.org/x/exp v0.0.0-20260508232706-74f9aab9d74a // indirect
	golang.org/x/image v0.41.0 // indirect
	golang.org/x/net v0.55.0 // indirect
	golang.org/x/sys v0.45.0 // indirect
	golang.org/x/text v0.37.0 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)

replace github.com/explore-flights/monorepo/go/common v0.0.0 => ../common
