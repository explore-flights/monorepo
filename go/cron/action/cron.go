package action

import (
	"context"
	"errors"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"time"
)

type CronParams struct {
	LoadFlightSchedules *struct {
		OutputBucket string    `json:"outputBucket"`
		OutputPrefix string    `json:"outputPrefix"`
		Time         time.Time `json:"time"`
		Schedule     string    `json:"schedule"`
	} `json:"loadFlightSchedules,omitempty"`
}

type CronOutput struct {
	LoadFlightSchedules    *InputOutput[LoadFlightSchedulesParams, LoadFlightSchedulesOutput]       `json:"loadFlightSchedules,omitempty"`
	ConvertFlightSchedules *InputOutput[ConvertFlightSchedulesParams, ConvertFlightSchedulesOutput] `json:"convertFlightSchedules,omitempty"`
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
	var err error

	if params.LoadFlightSchedules != nil {
		lfsInOut := InputOutput[LoadFlightSchedulesParams, LoadFlightSchedulesOutput]{
			Input: LoadFlightSchedulesParams{
				OutputBucket: params.LoadFlightSchedules.OutputBucket,
				OutputPrefix: params.LoadFlightSchedules.OutputPrefix,
				DateRanges:   nil,
			},
		}

		switch params.LoadFlightSchedules.Schedule {
		case "daily":
			now := params.LoadFlightSchedules.Time.UTC()
			dates := []xtime.LocalDate{
				xtime.NewLocalDate(now.AddDate(0, 0, 30*12)),
				xtime.NewLocalDate(now.AddDate(0, 0, 30*8)),
				xtime.NewLocalDate(now.AddDate(0, 0, 30*6)),
				xtime.NewLocalDate(now.AddDate(0, 0, 30*4)),
				xtime.NewLocalDate(now.AddDate(0, 0, 30*2)),
				xtime.NewLocalDate(now.AddDate(0, 0, 30)),
				xtime.NewLocalDate(now.AddDate(0, 0, 7)),
				xtime.NewLocalDate(now.AddDate(0, 0, 3)),
				xtime.NewLocalDate(now.AddDate(0, 0, 1)),
				xtime.NewLocalDate(now.AddDate(0, 0, -1)),
			}

			for _, d := range dates {
				lfsInOut.Input.DateRanges = append(lfsInOut.Input.DateRanges, [2]xtime.LocalDate{d, d})
			}

		default:
			return output, errors.New("invalid schedule")
		}

		if lfsInOut.Output, err = c.lfsA.Handle(ctx, lfsInOut.Input); err != nil {
			return output, err
		}

		output.LoadFlightSchedules = &lfsInOut
	}

	return output, nil
}
