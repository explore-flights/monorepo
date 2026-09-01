package action

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"maps"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sfn"
	sfnTypes "github.com/aws/aws-sdk-go-v2/service/sfn/types"
)

const runFetchSchedulesStateName = "RunFetchSchedules"

type PrepareRetryPayloadParams map[string]json.RawMessage

type PrepareRetryPayloadOutput map[string]json.RawMessage

type prepareRetryPayloadAction struct {
	sfnc sfn.GetExecutionHistoryAPIClient
}

func NewPrepareRetryPayloadAction(sfnc sfn.GetExecutionHistoryAPIClient) Action[PrepareRetryPayloadParams, PrepareRetryPayloadOutput] {
	return &prepareRetryPayloadAction{sfnc: sfnc}
}

func (a *prepareRetryPayloadAction) Handle(ctx context.Context, params PrepareRetryPayloadParams) (PrepareRetryPayloadOutput, error) {
	retryExecutionArn, err := retryExecutionArn(params)
	if err != nil {
		return nil, err
	}

	previousExecution, err := a.previousExecution(ctx, retryExecutionArn)
	if err != nil {
		return nil, err
	}

	output := make(PrepareRetryPayloadOutput, len(params)+1)
	maps.Copy(output, params)
	delete(output, "loadScheduleRanges")

	output["time"] = previousExecution.time

	if previousExecution.fetchSchedulesExecutionArn == "" {
		return output, nil
	}

	loadScheduleRanges, err := a.loadScheduleRanges(ctx, previousExecution.fetchSchedulesExecutionArn)
	if err != nil {
		return nil, err
	}
	output["loadScheduleRanges"] = loadScheduleRanges

	return output, nil
}

func retryExecutionArn(params PrepareRetryPayloadParams) (string, error) {
	rawArn, ok := params["retryExecutionArn"]
	if !ok {
		return "", fmt.Errorf("retryExecutionArn is required")
	}

	var arn string
	if err := json.Unmarshal(rawArn, &arn); err != nil {
		return "", fmt.Errorf("invalid retryExecutionArn: %w", err)
	}
	if arn == "" {
		return "", fmt.Errorf("retryExecutionArn is required")
	}

	return arn, nil
}

type previousExecution struct {
	time                       json.RawMessage
	fetchSchedulesExecutionArn string
}

func (a *prepareRetryPayloadAction) previousExecution(ctx context.Context, orchestrationExecutionArn string) (previousExecution, error) {
	paginator := sfn.NewGetExecutionHistoryPaginator(a.sfnc, &sfn.GetExecutionHistoryInput{
		ExecutionArn:         aws.String(orchestrationExecutionArn),
		IncludeExecutionData: aws.Bool(true),
	})

	var result previousExecution
	insideRunFetchSchedules := false

	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return previousExecution{}, fmt.Errorf("get orchestration execution history: %w", err)
		}

		for _, event := range page.Events {
			for _, payload := range eventPayloads(event) {
				time, ok, err := extractPayloadField(payload, "time")
				if err != nil {
					return previousExecution{}, fmt.Errorf("parse orchestration execution payload: %w", err)
				}
				if ok {
					result.time = time
				}
			}

			if details := event.StateEnteredEventDetails; details != nil {
				insideRunFetchSchedules = aws.ToString(details.Name) == runFetchSchedulesStateName
			}

			if insideRunFetchSchedules && event.TaskSubmittedEventDetails != nil {
				arn, err := executionArn(event.TaskSubmittedEventDetails.Output)
				if err != nil {
					return previousExecution{}, fmt.Errorf("parse %s child execution: %w", runFetchSchedulesStateName, err)
				}
				if arn != "" {
					result.fetchSchedulesExecutionArn = arn
				}
			}

			if details := event.StateExitedEventDetails; details != nil && aws.ToString(details.Name) == runFetchSchedulesStateName {
				insideRunFetchSchedules = false
			}
		}
	}

	if result.time == nil {
		return previousExecution{}, fmt.Errorf("execution %q has no time in its input", orchestrationExecutionArn)
	}

	return result, nil
}

func executionArn(raw *string) (string, error) {
	if raw == nil {
		return "", nil
	}

	var output map[string]json.RawMessage
	if err := json.Unmarshal([]byte(*raw), &output); err != nil {
		return "", err
	}

	for _, key := range []string{"ExecutionArn", "executionArn"} {
		rawArn, ok := output[key]
		if !ok {
			continue
		}

		var arn string
		if err := json.Unmarshal(rawArn, &arn); err != nil {
			return "", err
		}

		return arn, nil
	}

	return "", nil
}

func (a *prepareRetryPayloadAction) loadScheduleRanges(ctx context.Context, fetchSchedulesExecutionArn string) (json.RawMessage, error) {
	paginator := sfn.NewGetExecutionHistoryPaginator(a.sfnc, &sfn.GetExecutionHistoryInput{
		ExecutionArn:         aws.String(fetchSchedulesExecutionArn),
		IncludeExecutionData: aws.Bool(true),
		ReverseOrder:         true,
	})

	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("get fetch schedules execution history: %w", err)
		}

		for _, event := range page.Events {
			for _, payload := range eventPayloads(event) {
				loadScheduleRanges, ok, err := extractLoadScheduleRanges(payload)
				if err != nil {
					return nil, fmt.Errorf("parse fetch schedules execution payload: %w", err)
				}
				if ok {
					return loadScheduleRanges, nil
				}
			}
		}
	}

	return nil, fmt.Errorf("execution %q has no loadScheduleRanges payload", fetchSchedulesExecutionArn)
}

func eventPayloads(event sfnTypes.HistoryEvent) []*string {
	payloads := make([]*string, 0, 4)

	if details := event.StateExitedEventDetails; details != nil {
		payloads = append(payloads, details.Output)
	}
	if details := event.StateEnteredEventDetails; details != nil {
		payloads = append(payloads, details.Input)
	}
	if details := event.ExecutionSucceededEventDetails; details != nil {
		payloads = append(payloads, details.Output)
	}
	if details := event.ExecutionStartedEventDetails; details != nil {
		payloads = append(payloads, details.Input)
	}

	return payloads
}

func extractLoadScheduleRanges(raw *string) (json.RawMessage, bool, error) {
	return extractPayloadField(raw, "loadScheduleRanges")
}

func extractPayloadField(raw *string, field string) (json.RawMessage, bool, error) {
	if raw == nil {
		return nil, false, nil
	}

	trimmed := bytes.TrimSpace([]byte(*raw))
	if !json.Valid(trimmed) {
		return nil, false, fmt.Errorf("invalid JSON payload")
	}
	if len(trimmed) == 0 || trimmed[0] != '{' {
		return nil, false, nil
	}

	var payload map[string]json.RawMessage
	if err := json.Unmarshal(trimmed, &payload); err != nil {
		return nil, false, err
	}

	value, ok := payload[field]
	if !ok || string(value) == "null" {
		return nil, false, nil
	}

	return value, true, nil
}
