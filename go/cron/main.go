package main

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/cron/action"
	"github.com/explore-flights/monorepo/go/cron/lufthansa"
	"golang.org/x/time/rate"
	"os"
	"os/signal"
	"syscall"
	"time"
)

var lhClientId string
var lhClientSecret string

func init() {
	lhClientId = os.Getenv("FLIGHTS_LH_API_CLIENT_ID")
	if lhClientId == "" {
		panic("env variable FLIGHTS_LH_API_CLIENT_ID required")
	}

	lhClientSecret = os.Getenv("FLIGHTS_LH_API_CLIENT_SECRET")
	if lhClientSecret == "" {
		panic("env variable FLIGHTS_LH_API_CLIENT_SECRET required")
	}
}

type InputEvent struct {
	Action string          `json:"action"`
	Params json.RawMessage `json:"params"`
}

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		panic(err)
	}

	lambda.StartWithOptions(newHandler(s3.NewFromConfig(cfg)), lambda.WithContext(ctx))
}

func newHandler(s3c *s3.Client) func(ctx context.Context, event InputEvent) ([]byte, error) {
	lhc := lufthansa.NewClient(
		lhClientId,
		lhClientSecret,
		lufthansa.WithRateLimiter(rate.NewLimiter(rate.Every(990*time.Hour), 4)),
	)

	lfsAction := action.NewLoadFlightSchedulesAction(s3c, lhc)
	cfsAction := action.NewConvertFlightSchedulesAction(s3c)

	return func(ctx context.Context, event InputEvent) ([]byte, error) {
		switch event.Action {
		case "load_flight_schedules":
			return handle(ctx, lfsAction, event.Params)

		case "convert_flight_schedules":
			return handle(ctx, cfsAction, event.Params)
		}

		return nil, fmt.Errorf("unsupported action: %v", event.Action)
	}
}

func handle[IN any, OUT any](ctx context.Context, act action.Action[IN, OUT], params json.RawMessage) ([]byte, error) {
	var input IN
	if err := json.Unmarshal(params, &input); err != nil {
		return nil, err
	}

	output, err := act.Handle(ctx, input)
	if err != nil {
		return nil, err
	}

	return json.Marshal(output)
}
