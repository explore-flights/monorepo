package action

import (
	"context"
	"errors"
	"github.com/explore-flights/monorepo/go/common"
	"time"
)

type CronParams struct {
	LoadFlightSchedules *struct {
		OutputBucket string `json:"outputBucket"`
		OutputPrefix string `json:"outputPrefix"`
		Schedule     string `json:"schedule"`
	} `json:"loadFlightSchedules,omitempty"`
	ConvertFlightSchedules *struct {
		InputBucket  string `json:"inputBucket"`
		InputPrefix  string `json:"inputPrefix"`
		OutputBucket string `json:"outputBucket"`
		OutputPrefix string `json:"outputPrefix"`
		Schedule     string `json:"schedule"`
	} `json:"convertFlightSchedules,omitempty"`
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
			now := time.Now()
			dates := []common.LocalDate{
				common.NewLocalDate(now.AddDate(1, 0, 0)),
				common.NewLocalDate(now.AddDate(0, 8, 0)),
				common.NewLocalDate(now.AddDate(0, 6, 0)),
				common.NewLocalDate(now.AddDate(0, 4, 0)),
				common.NewLocalDate(now.AddDate(0, 2, 0)),
				common.NewLocalDate(now.AddDate(0, 1, 0)),
			}

			for _, d := range dates {
				lfsInOut.Input.DateRanges = append(lfsInOut.Input.DateRanges, [2]common.LocalDate{d, d})
			}

		default:
			return output, errors.New("invalid schedule")
		}

		if lfsInOut.Output, err = c.lfsA.Handle(ctx, lfsInOut.Input); err != nil {
			return output, err
		}

		output.LoadFlightSchedules = &lfsInOut
	}

	if params.ConvertFlightSchedules != nil {
		cfsInOut := InputOutput[ConvertFlightSchedulesParams, ConvertFlightSchedulesOutput]{
			Input: ConvertFlightSchedulesParams{
				InputBucket:  params.ConvertFlightSchedules.InputBucket,
				InputPrefix:  params.ConvertFlightSchedules.InputPrefix,
				OutputBucket: params.ConvertFlightSchedules.OutputBucket,
				OutputPrefix: params.ConvertFlightSchedules.OutputPrefix,
				DateRanges:   nil,
			},
		}

		switch params.LoadFlightSchedules.Schedule {
		case "daily":
			start := time.Now()
			end := start.AddDate(0, 0, 7)

			cfsInOut.Input.DateRanges = append(cfsInOut.Input.DateRanges, [2]common.LocalDate{
				common.NewLocalDate(start),
				common.NewLocalDate(end),
			})

		default:
			return output, errors.New("invalid schedule")
		}

		if cfsInOut.Output, err = c.cfsA.Handle(ctx, cfsInOut.Input); err != nil {
			return output, err
		}

		output.ConvertFlightSchedules = &cfsInOut
	}

	return output, nil
}
