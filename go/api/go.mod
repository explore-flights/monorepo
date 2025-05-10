module github.com/explore-flights/monorepo/go/api

go 1.24

require (
	github.com/aws/aws-sdk-go-v2 v1.36.3
	github.com/aws/aws-sdk-go-v2/config v1.29.9
	github.com/aws/aws-sdk-go-v2/service/s3 v1.78.2
	github.com/aws/aws-sdk-go-v2/service/ssm v1.57.2
	github.com/explore-flights/monorepo/go/common v0.0.0
	github.com/goccy/go-graphviz v0.2.9
	github.com/gofrs/uuid/v5 v5.3.1
	github.com/golang-jwt/jwt/v5 v5.2.1
	github.com/gorilla/feeds v1.2.0
	github.com/its-felix/aws-lwa-go-middleware v0.1.1
	github.com/json-iterator/go v1.1.12
	github.com/jxskiss/base62 v1.1.0
	github.com/labstack/echo/v4 v4.13.3
	github.com/marcboeker/go-duckdb/v2 v2.2.0
	github.com/stretchr/testify v1.10.0
	golang.org/x/sync v0.12.0
	golang.org/x/time v0.11.0
	google.golang.org/protobuf v1.36.5
)

require (
	github.com/apache/arrow-go/v18 v18.1.0 // indirect
	github.com/aws/aws-lambda-go v1.47.0 // indirect
	github.com/aws/aws-sdk-go-v2/aws/protocol/eventstream v1.6.10 // indirect
	github.com/aws/aws-sdk-go-v2/credentials v1.17.62 // indirect
	github.com/aws/aws-sdk-go-v2/feature/ec2/imds v1.16.30 // indirect
	github.com/aws/aws-sdk-go-v2/internal/configsources v1.3.34 // indirect
	github.com/aws/aws-sdk-go-v2/internal/endpoints/v2 v2.6.34 // indirect
	github.com/aws/aws-sdk-go-v2/internal/ini v1.8.3 // indirect
	github.com/aws/aws-sdk-go-v2/internal/v4a v1.3.34 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/accept-encoding v1.12.3 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/checksum v1.7.0 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/presigned-url v1.12.15 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/s3shared v1.18.15 // indirect
	github.com/aws/aws-sdk-go-v2/service/sso v1.25.1 // indirect
	github.com/aws/aws-sdk-go-v2/service/ssooidc v1.29.1 // indirect
	github.com/aws/aws-sdk-go-v2/service/sts v1.33.17 // indirect
	github.com/aws/smithy-go v1.22.3 // indirect
	github.com/davecgh/go-spew v1.1.1 // indirect
	github.com/disintegration/imaging v1.6.2 // indirect
	github.com/duckdb/duckdb-go-bindings v0.1.14 // indirect
	github.com/duckdb/duckdb-go-bindings/darwin-amd64 v0.1.9 // indirect
	github.com/duckdb/duckdb-go-bindings/darwin-arm64 v0.1.9 // indirect
	github.com/duckdb/duckdb-go-bindings/linux-amd64 v0.1.9 // indirect
	github.com/duckdb/duckdb-go-bindings/linux-arm64 v0.1.9 // indirect
	github.com/duckdb/duckdb-go-bindings/windows-amd64 v0.1.9 // indirect
	github.com/flopp/go-findfont v0.1.0 // indirect
	github.com/fogleman/gg v1.3.0 // indirect
	github.com/go-jose/go-jose/v4 v4.0.5 // indirect
	github.com/go-viper/mapstructure/v2 v2.2.1 // indirect
	github.com/goccy/go-json v0.10.5 // indirect
	github.com/golang/freetype v0.0.0-20170609003504-e2365dfdc4a0 // indirect
	github.com/google/flatbuffers v25.1.24+incompatible // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/klauspost/compress v1.17.11 // indirect
	github.com/klauspost/cpuid/v2 v2.2.9 // indirect
	github.com/labstack/gommon v0.4.2 // indirect
	github.com/marcboeker/go-duckdb/arrowmapping v0.0.7 // indirect
	github.com/marcboeker/go-duckdb/mapping v0.0.7 // indirect
	github.com/mattn/go-colorable v0.1.14 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/modern-go/concurrent v0.0.0-20180306012644-bacd9c7ef1dd // indirect
	github.com/modern-go/reflect2 v1.0.2 // indirect
	github.com/pierrec/lz4/v4 v4.1.22 // indirect
	github.com/pmezard/go-difflib v1.0.0 // indirect
	github.com/tetratelabs/wazero v1.9.0 // indirect
	github.com/valyala/bytebufferpool v1.0.0 // indirect
	github.com/valyala/fasttemplate v1.2.2 // indirect
	github.com/zeebo/xxh3 v1.0.2 // indirect
	golang.org/x/crypto v0.36.0 // indirect
	golang.org/x/exp v0.0.0-20250128182459-e0ece0dbea4c // indirect
	golang.org/x/image v0.25.0 // indirect
	golang.org/x/mod v0.22.0 // indirect
	golang.org/x/net v0.37.0 // indirect
	golang.org/x/sys v0.31.0 // indirect
	golang.org/x/text v0.23.0 // indirect
	golang.org/x/tools v0.29.0 // indirect
	golang.org/x/xerrors v0.0.0-20240903120638-7835f813f4da // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)

replace github.com/explore-flights/monorepo/go/common v0.0.0 => ../common
