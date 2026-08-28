package action

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sfn"
	sfnTypes "github.com/aws/aws-sdk-go-v2/service/sfn/types"
)

func TestPrepareRetryPayloadAction(t *testing.T) {
	const (
		orchestrationExecutionArn  = "arn:aws:states:eu-central-1:123456789012:execution:FlightSchedules:previous"
		fetchSchedulesExecutionArn = "arn:aws:states:eu-central-1:123456789012:execution:FetchSchedules:child"
	)

	sfnc := &prepareRetryPayloadSfnClient{
		pages: map[historyRequest]*sfn.GetExecutionHistoryOutput{
			{executionArn: orchestrationExecutionArn}: {
				Events: []sfnTypes.HistoryEvent{
					executionStartedEvent(`{"time":"2026-08-29T10:00:00Z","schedule":"daily"}`),
					stateEnteredEvent("RunUpdateFlightData", `{}`),
					taskSubmittedEvent(`{"ExecutionArn":"arn:aws:states:eu-central-1:123456789012:execution:UpdateFlightData:child"}`),
					stateExitedEvent("RunUpdateFlightData", `{}`),
					stateEnteredEvent(runFetchSchedulesStateName, `{}`),
				},
				NextToken: aws.String("parent-page-2"),
			},
			{executionArn: orchestrationExecutionArn, nextToken: "parent-page-2"}: {
				Events: []sfnTypes.HistoryEvent{
					taskSubmittedEvent(`{"ExecutionArn":"` + fetchSchedulesExecutionArn + `"}`),
				},
			},
			{executionArn: fetchSchedulesExecutionArn, reverseOrder: true}: {
				Events: []sfnTypes.HistoryEvent{
					{Type: sfnTypes.HistoryEventTypeTaskFailed},
					stateEnteredEvent("FetchSchedulesLoadSchedules", `{
						"loadScheduleRanges": {
							"completed": [["2026-08-27", "2026-08-29"]],
							"remaining": [["2026-08-30", "2027-08-29"]]
						}
					}`),
					stateEnteredEvent("FetchSchedulesCheckRemaining", `{
						"loadScheduleRanges": {
							"completed": [],
							"remaining": [["2026-08-27", "2027-08-29"]]
						}
					}`),
				},
			},
		},
	}

	action := NewPrepareRetryPayloadAction(sfnc)
	output, err := action.Handle(t.Context(), PrepareRetryPayloadParams{
		"retryExecutionArn": json.RawMessage(`"` + orchestrationExecutionArn + `"`),
	})
	if err != nil {
		t.Fatalf("Handle() error = %v", err)
	}

	assertJsonEqual(t, output["time"], json.RawMessage(`"2026-08-29T10:00:00Z"`))
	assertJsonEqual(t, output["retryExecutionArn"], json.RawMessage(`"`+orchestrationExecutionArn+`"`))
	assertJsonEqual(t, output["loadScheduleRanges"], json.RawMessage(`{
		"completed": [["2026-08-27", "2026-08-29"]],
		"remaining": [["2026-08-30", "2027-08-29"]]
	}`))

	if len(sfnc.requests) != 3 {
		t.Fatalf("GetExecutionHistory() call count = %d, want 3", len(sfnc.requests))
	}
	if !sfnc.requests[2].reverseOrder {
		t.Error("fetch schedules history was not requested in reverse order")
	}
}

func TestPrepareRetryPayloadActionRejectsMissingRetryExecutionArn(t *testing.T) {
	sfnc := &prepareRetryPayloadSfnClient{}
	action := NewPrepareRetryPayloadAction(sfnc)

	_, err := action.Handle(t.Context(), PrepareRetryPayloadParams{})
	if err == nil || !strings.Contains(err.Error(), "retryExecutionArn is required") {
		t.Fatalf("Handle() error = %v, want missing retryExecutionArn error", err)
	}
	if len(sfnc.requests) != 0 {
		t.Fatalf("GetExecutionHistory() call count = %d, want 0", len(sfnc.requests))
	}
}

func TestPrepareRetryPayloadActionAllowsMissingFetchSchedulesChild(t *testing.T) {
	const orchestrationExecutionArn = "arn:aws:states:eu-central-1:123456789012:execution:FlightSchedules:previous"

	sfnc := &prepareRetryPayloadSfnClient{
		pages: map[historyRequest]*sfn.GetExecutionHistoryOutput{
			{executionArn: orchestrationExecutionArn}: {
				Events: []sfnTypes.HistoryEvent{
					executionStartedEvent(`{"retryExecutionArn":"arn:aws:states:eu-central-1:123456789012:execution:FlightSchedules:original"}`),
					stateExitedEvent("PrepareRetryPayload", `{"time":"2026-08-29T10:00:00Z"}`),
					stateEnteredEvent("FetchSchedulesPrepareDailyCron", `{"time":"2026-08-29T10:00:00Z"}`),
					stateExitedEvent("OrchestrationTry", `[{"time":"2026-08-29T10:00:00Z"}]`),
				},
			},
		},
	}
	action := NewPrepareRetryPayloadAction(sfnc)

	output, err := action.Handle(t.Context(), PrepareRetryPayloadParams{
		"retryExecutionArn": json.RawMessage(`"` + orchestrationExecutionArn + `"`),
		"loadScheduleRanges": json.RawMessage(`{
			"completed": [],
			"remaining": []
		}`),
	})
	if err != nil {
		t.Fatalf("Handle() error = %v", err)
	}

	assertJsonEqual(t, output["time"], json.RawMessage(`"2026-08-29T10:00:00Z"`))
	if _, ok := output["loadScheduleRanges"]; ok {
		t.Error("Handle() added loadScheduleRanges without a fetch schedules child execution")
	}
	if len(sfnc.requests) != 1 {
		t.Fatalf("GetExecutionHistory() call count = %d, want 1", len(sfnc.requests))
	}
}

func TestPrepareRetryPayloadActionRequiresLoadScheduleRanges(t *testing.T) {
	const (
		orchestrationExecutionArn  = "arn:aws:states:eu-central-1:123456789012:execution:FlightSchedules:previous"
		fetchSchedulesExecutionArn = "arn:aws:states:eu-central-1:123456789012:execution:FetchSchedules:child"
	)

	sfnc := &prepareRetryPayloadSfnClient{
		pages: map[historyRequest]*sfn.GetExecutionHistoryOutput{
			{executionArn: orchestrationExecutionArn}: {
				Events: []sfnTypes.HistoryEvent{
					executionStartedEvent(`{"time":"2026-08-29T10:00:00Z"}`),
					stateEnteredEvent(runFetchSchedulesStateName, `{}`),
					taskSubmittedEvent(`{"ExecutionArn":"` + fetchSchedulesExecutionArn + `"}`),
				},
			},
			{executionArn: fetchSchedulesExecutionArn, reverseOrder: true}: {
				Events: []sfnTypes.HistoryEvent{
					stateEnteredEvent("FetchSchedulesLoadSchedules", `{"loadSchedulesResponse": {}}`),
				},
			},
		},
	}
	action := NewPrepareRetryPayloadAction(sfnc)

	_, err := action.Handle(t.Context(), PrepareRetryPayloadParams{
		"retryExecutionArn": json.RawMessage(`"` + orchestrationExecutionArn + `"`),
	})
	if err == nil || !strings.Contains(err.Error(), "has no loadScheduleRanges payload") {
		t.Fatalf("Handle() error = %v, want missing loadScheduleRanges error", err)
	}
}

type historyRequest struct {
	executionArn string
	nextToken    string
	reverseOrder bool
}

type prepareRetryPayloadSfnClient struct {
	pages    map[historyRequest]*sfn.GetExecutionHistoryOutput
	err      error
	requests []historyRequest
}

func (c *prepareRetryPayloadSfnClient) GetExecutionHistory(_ context.Context, input *sfn.GetExecutionHistoryInput, _ ...func(*sfn.Options)) (*sfn.GetExecutionHistoryOutput, error) {
	request := historyRequest{
		executionArn: aws.ToString(input.ExecutionArn),
		nextToken:    aws.ToString(input.NextToken),
		reverseOrder: input.ReverseOrder,
	}
	c.requests = append(c.requests, request)

	if c.err != nil {
		return nil, c.err
	}

	page, ok := c.pages[request]
	if !ok {
		return nil, errors.New("unexpected GetExecutionHistory request")
	}

	return page, nil
}

func stateEnteredEvent(name, input string) sfnTypes.HistoryEvent {
	return sfnTypes.HistoryEvent{
		Type: sfnTypes.HistoryEventTypeTaskStateEntered,
		StateEnteredEventDetails: &sfnTypes.StateEnteredEventDetails{
			Name:  aws.String(name),
			Input: aws.String(input),
		},
	}
}

func executionStartedEvent(input string) sfnTypes.HistoryEvent {
	return sfnTypes.HistoryEvent{
		Type: sfnTypes.HistoryEventTypeExecutionStarted,
		ExecutionStartedEventDetails: &sfnTypes.ExecutionStartedEventDetails{
			Input: aws.String(input),
		},
	}
}

func stateExitedEvent(name, output string) sfnTypes.HistoryEvent {
	return sfnTypes.HistoryEvent{
		Type: sfnTypes.HistoryEventTypeTaskStateExited,
		StateExitedEventDetails: &sfnTypes.StateExitedEventDetails{
			Name:   aws.String(name),
			Output: aws.String(output),
		},
	}
}

func taskSubmittedEvent(output string) sfnTypes.HistoryEvent {
	return sfnTypes.HistoryEvent{
		Type: sfnTypes.HistoryEventTypeTaskSubmitted,
		TaskSubmittedEventDetails: &sfnTypes.TaskSubmittedEventDetails{
			Output: aws.String(output),
		},
	}
}

func assertJsonEqual(t *testing.T, got, want json.RawMessage) {
	t.Helper()

	var gotValue any
	if err := json.Unmarshal(got, &gotValue); err != nil {
		t.Fatalf("invalid actual JSON %q: %v", got, err)
	}

	var wantValue any
	if err := json.Unmarshal(want, &wantValue); err != nil {
		t.Fatalf("invalid expected JSON %q: %v", want, err)
	}

	if !reflect.DeepEqual(gotValue, wantValue) {
		t.Errorf("JSON = %s, want %s", got, want)
	}
}
