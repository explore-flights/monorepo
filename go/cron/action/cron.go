package action

import (
	"context"
	"errors"
	"fmt"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"strconv"
	"strings"
	"time"
)

type CronParams struct {
	LoadFlightSchedules *struct {
		OutputBucket string    `json:"outputBucket"`
		OutputPrefix string    `json:"outputPrefix"`
		Time         time.Time `json:"time"`
		Schedule     string    `json:"schedule,omitempty"`
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

		if params.LoadFlightSchedules.Schedule != "" {
			if schedule, offsetRaw, found := strings.Cut(params.LoadFlightSchedules.Schedule, ":"); found {
				now := params.LoadFlightSchedules.Time.UTC()
				dateOffset := now.AddDate(0, 0, -1)
				var offset int

				if offset, err = strconv.Atoi(offsetRaw); err != nil {
					return output, fmt.Errorf("invalid offset: %w", err)
				}

				switch schedule {
				case "daily":
					const daysPerExecution = 30

					start := dateOffset.AddDate(0, 0, offset*daysPerExecution)
					end := start.AddDate(0, 0, daysPerExecution-1)

					lfsInOut.Input.DateRanges = lfsInOut.Input.DateRanges.Expand(xtime.LocalDateRange{
						xtime.NewLocalDate(start),
						xtime.NewLocalDate(end),
					})

				default:
					return output, errors.New("invalid schedule")
				}
			} else {
				return output, fmt.Errorf("invalid schedule: %v", params.LoadFlightSchedules.Schedule)
			}
		} else {
			return output, errors.New("only daily schedule with offset supported")
		}

		if lfsInOut.Output, err = c.lfsA.Handle(ctx, lfsInOut.Input); err != nil {
			return output, err
		}

		output.LoadFlightSchedules = &lfsInOut
	}

	return output, nil
}
