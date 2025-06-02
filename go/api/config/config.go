package config

import (
	"context"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/web"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"github.com/explore-flights/monorepo/go/common/lufthansa"
)

type S3Client interface {
	adapt.S3Getter
	adapt.S3Putter
	adapt.S3Lister
	adapt.S3Header
}

type Accessor interface {
	EchoPort() int
	S3Client(ctx context.Context) (S3Client, error)
	DataBucket() (string, error)
	ParquetBucket() (string, error)
	AuthorizationHandler(ctx context.Context) (*web.AuthorizationHandler, error)
	LufthansaClient() (*lufthansa.Client, error)
	Database() (*db.Database, error)
	VersionTxtPath() string
}
