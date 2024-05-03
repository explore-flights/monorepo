package action

import (
	"bytes"
	"context"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/cron/lufthansa"
	"time"
)

type LoadFlightSchedulesParams struct {
	OutputBucket string                `json:"outputBucket"`
	OutputPrefix string                `json:"outputPrefix"`
	DateRanges   [][2]common.LocalDate `json:"dateRanges"`
}

type LoadFlightSchedulesOutput struct {
}

type lfsAction struct {
	s3c *s3.Client
	lhc *lufthansa.Client
}

func NewLoadFlightSchedulesAction(s3c *s3.Client, lhc *lufthansa.Client) Action[LoadFlightSchedulesParams, LoadFlightSchedulesOutput] {
	return &lfsAction{
		s3c: s3c,
		lhc: lhc,
	}
}

func (a *lfsAction) Handle(ctx context.Context, params LoadFlightSchedulesParams) (LoadFlightSchedulesOutput, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	for _, r := range params.DateRanges {
		for _, d := range r[0].Until(r[1]) {
			if err := a.loadSingle(ctx, params.OutputBucket, params.OutputPrefix, d); err != nil {
				return LoadFlightSchedulesOutput{}, err
			}
		}
	}

	return LoadFlightSchedulesOutput{}, nil
}

func (a *lfsAction) loadSingle(ctx context.Context, bucket, prefix string, d common.LocalDate) error {
	var b bytes.Buffer
	b.Bytes()
	err := a.lhc.FlightSchedulesRaw(
		ctx,
		[]common.AirlineIdentifier{common.Lufthansa, common.AirDolomiti, common.Swiss, common.Austrian, common.Edelweiss, common.Brussels, common.EurowingsDiscover},
		d,
		d,
		[]time.Weekday{time.Monday, time.Tuesday, time.Wednesday, time.Thursday, time.Friday, time.Saturday, time.Sunday},
		&b,
	)

	if err != nil {
		return err
	}

	_, err = a.s3c.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(bucket),
		Key:         aws.String(prefix + d.Time(nil).Format("2006/01/02") + ".json"),
		ContentType: aws.String("application/json"),
		Body:        bytes.NewReader(b.Bytes()),
	})

	return err
}
