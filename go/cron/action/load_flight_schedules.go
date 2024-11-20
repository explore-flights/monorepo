package action

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/lufthansa"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"time"
)

type LoadFlightSchedulesParams struct {
	OutputBucket string                `json:"outputBucket"`
	OutputPrefix string                `json:"outputPrefix"`
	DateRanges   xtime.LocalDateRanges `json:"dateRanges"`
	AllowPartial bool                  `json:"allowPartial"`
}

type LoadFlightSchedulesOutput struct {
	Completed xtime.LocalDateRanges `json:"completed"`
	Remaining xtime.LocalDateRanges `json:"remaining"`
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
	if deadline, ok := ctx.Deadline(); params.AllowPartial && ok {
		var cancel context.CancelFunc
		deadline = deadline.Add(-time.Minute)
		ctx, cancel = context.WithDeadline(ctx, deadline)
		defer cancel()

		fmt.Printf("loading schedules %v with deadline %v\n", params.DateRanges, deadline)
	} else {
		var cancel context.CancelFunc
		ctx, cancel = context.WithCancel(ctx)
		defer cancel()

		fmt.Printf("loading schedules %v without deadline\n", params.DateRanges)
	}

	result := LoadFlightSchedulesOutput{
		Remaining: params.DateRanges,
	}

	for d := range result.Remaining.Iter() {
		if err := a.loadSingle(ctx, params.OutputBucket, params.OutputPrefix, d); err != nil {
			if params.AllowPartial && (errors.Is(err, context.DeadlineExceeded) || errors.Is(err, lufthansa.ErrRateLimitWouldExceedDeadline)) {
				err = nil
			}

			return result, err
		}

		result.Completed = result.Completed.Add(d)
		result.Remaining = result.Remaining.Remove(d)
	}

	fmt.Printf("loaded schedules %v; remaininng: %v\n", result.Completed, result.Remaining)

	return result, nil
}

func (a *lfsAction) loadSingle(ctx context.Context, bucket, prefix string, d xtime.LocalDate) error {
	var b bytes.Buffer
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
