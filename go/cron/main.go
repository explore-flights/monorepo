package main

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common/lufthansa"
	"github.com/explore-flights/monorepo/go/cron/action"
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

func newHandler(s3c *s3.Client) func(ctx context.Context, event InputEvent) (json.RawMessage, error) {
	lhc := lufthansa.NewClient(
		lhClientId,
		lhClientSecret,
		lufthansa.WithRateLimiter(rate.NewLimiter(rate.Every(time.Hour)*990, 3)),
	)

	lCountriesAction := action.NewLoadMetadataAction(s3c, lhc, (*lufthansa.Client).CountriesRaw, "countries")
	lCitiesAction := action.NewLoadMetadataAction(s3c, lhc, (*lufthansa.Client).CitiesRaw, "cities")
	lAirportsAction := action.NewLoadMetadataAction(s3c, lhc, (*lufthansa.Client).AirportsRaw, "airports")
	lAirlinesAction := action.NewLoadMetadataAction(s3c, lhc, (*lufthansa.Client).AirlinesRaw, "airlines")
	lAircraftAction := action.NewLoadMetadataAction(s3c, lhc, (*lufthansa.Client).AircraftRaw, "aircraft")
	lfsAction := action.NewLoadFlightSchedulesAction(s3c, lhc)
	cfsAction := action.NewConvertFlightSchedulesAction(s3c)
	cronAction := action.NewCronAction(lfsAction, cfsAction)

	return func(ctx context.Context, event InputEvent) (json.RawMessage, error) {
		switch event.Action {
		case "load_countries":
			return handle(ctx, lCountriesAction, event.Params)

		case "load_cities":
			return handle(ctx, lCitiesAction, event.Params)

		case "load_airports":
			return handle(ctx, lAirportsAction, event.Params)

		case "load_airlines":
			return handle(ctx, lAirlinesAction, event.Params)

		case "load_aircraft":
			return handle(ctx, lAircraftAction, event.Params)

		case "load_flight_schedules":
			return handle(ctx, lfsAction, event.Params)

		case "convert_flight_schedules":
			return handle(ctx, cfsAction, event.Params)

		case "cron":
			return handle(ctx, cronAction, event.Params)
		}

		return nil, fmt.Errorf("unsupported action: %v", event.Action)
	}
}

func handle[IN any, OUT any](ctx context.Context, act action.Action[IN, OUT], params json.RawMessage) (json.RawMessage, error) {
	var input IN
	if err := json.Unmarshal(params, &input); err != nil {
		return nil, err
	}

	output, err := act.Handle(ctx, input)
	if err != nil {
		return nil, err
	}

	b, err := json.Marshal(output)
	if err != nil {
		return nil, err
	}

	return b, nil
}
