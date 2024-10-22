package action

import (
	"context"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"time"
)

type CronParams struct {
	PrepareDailyCron *struct {
		Time   time.Time `json:"time"`
		Offset int       `json:"offset"`
		Total  int       `json:"total"`
	} `json:"prepareDailyCron,omitempty"`

	MergeDateRanges *struct {
		First  xtime.LocalDateRanges `json:"first"`
		Second xtime.LocalDateRanges `json:"second"`
	} `json:"mergeDateRanges,omitempty"`
}

type CronOutput struct {
	PrepareDailyCron *struct {
		DateRanges xtime.LocalDateRanges `json:"dateRanges"`
	} `json:"prepareDailyCron,omitempty"`

	MergeDateRanges *struct {
		DateRanges xtime.LocalDateRanges `json:"dateRanges"`
	} `json:"mergeDateRanges,omitempty"`
}

type InputOutput[IN any, OUT any] struct {
	Input  IN  `json:"input"`
	Output OUT `json:"output"`
}

type cronAction struct {
	lfsA Action[LoadFlightSchedulesParams, LoadFlightSchedulesOutput]
	cfsA Action[ConvertFlightSchedulesParams, ConvertFlightSchedulesOutput]
}

func NewCronAction(lfsA Action[LoadFlightSchedulesParams, LoadFlightSchedulesOutput], cfsA Action[ConvertFlightSchedulesParams, ConvertFlightSchedulesOutput]) Action[CronParams, CronOutput] {
	return &cronAction{
		lfsA: lfsA,
		cfsA: cfsA,
	}
}

func (c *cronAction) Handle(ctx context.Context, params CronParams) (CronOutput, error) {
	var output CronOutput

	if params.PrepareDailyCron != nil {
		now := params.PrepareDailyCron.Time.UTC()
		start := now.AddDate(0, 0, params.PrepareDailyCron.Offset)
		end := start.AddDate(0, 0, params.PrepareDailyCron.Total)
		ldr := xtime.LocalDateRange{xtime.NewLocalDate(start), xtime.NewLocalDate(end)}

		output.PrepareDailyCron = &struct {
			DateRanges xtime.LocalDateRanges `json:"dateRanges"`
		}{
			DateRanges: xtime.NewLocalDateRanges(ldr.Iter()),
		}
	}

	if params.MergeDateRanges != nil {
		output.MergeDateRanges = &struct {
			DateRanges xtime.LocalDateRanges `json:"dateRanges"`
		}{
			DateRanges: params.MergeDateRanges.First.ExpandAll(params.MergeDateRanges.Second),
		}
	}

	return output, nil
}
