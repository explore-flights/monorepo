module github.com/explore-flights/monorepo/go/api

go 1.22

require (
	github.com/aws/aws-sdk-go-v2 v1.27.0
	github.com/aws/aws-sdk-go-v2/config v1.27.15
	github.com/aws/aws-sdk-go-v2/service/s3 v1.54.2
	github.com/aws/aws-sdk-go-v2/service/ssm v1.50.3
	github.com/explore-flights/monorepo/go/common v0.0.0
	github.com/goccy/go-graphviz v0.1.2
	github.com/gofrs/uuid/v5 v5.2.0
	github.com/golang-jwt/jwt/v5 v5.2.1
	github.com/labstack/echo/v4 v4.12.0
	golang.org/x/sync v0.7.0
	google.golang.org/protobuf v1.34.1
)

require (
	github.com/aws/aws-sdk-go-v2/aws/protocol/eventstream v1.6.2 // indirect
	github.com/aws/aws-sdk-go-v2/credentials v1.17.15 // indirect
	github.com/aws/aws-sdk-go-v2/feature/ec2/imds v1.16.3 // indirect
	github.com/aws/aws-sdk-go-v2/internal/configsources v1.3.7 // indirect
	github.com/aws/aws-sdk-go-v2/internal/endpoints/v2 v2.6.7 // indirect
	github.com/aws/aws-sdk-go-v2/internal/ini v1.8.0 // indirect
	github.com/aws/aws-sdk-go-v2/internal/v4a v1.3.7 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/accept-encoding v1.11.2 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/checksum v1.3.9 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/presigned-url v1.11.9 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/s3shared v1.17.7 // indirect
	github.com/aws/aws-sdk-go-v2/service/sso v1.20.8 // indirect
	github.com/aws/aws-sdk-go-v2/service/ssooidc v1.24.2 // indirect
	github.com/aws/aws-sdk-go-v2/service/sts v1.28.9 // indirect
	github.com/aws/smithy-go v1.20.2 // indirect
	github.com/fogleman/gg v1.3.0 // indirect
	github.com/go-jose/go-jose/v4 v4.0.2 // indirect
	github.com/golang/freetype v0.0.0-20170609003504-e2365dfdc4a0 // indirect
	github.com/google/go-cmp v0.6.0 // indirect
	github.com/jmespath/go-jmespath v0.4.0 // indirect
	github.com/labstack/gommon v0.4.2 // indirect
	github.com/mattn/go-colorable v0.1.13 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/pkg/errors v0.9.1 // indirect
	github.com/valyala/bytebufferpool v1.0.0 // indirect
	github.com/valyala/fasttemplate v1.2.2 // indirect
	golang.org/x/crypto v0.22.0 // indirect
	golang.org/x/image v0.14.0 // indirect
	golang.org/x/net v0.24.0 // indirect
	golang.org/x/sys v0.19.0 // indirect
	golang.org/x/text v0.14.0 // indirect
	golang.org/x/time v0.5.0 // indirect
)

replace github.com/explore-flights/monorepo/go/common v0.0.0 => ../common
