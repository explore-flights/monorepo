package main

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/ssm"
	"github.com/explore-flights/monorepo/go/common/lufthansa"
	"github.com/explore-flights/monorepo/go/cron/action"
	"golang.org/x/time/rate"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

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

	s3c := s3.NewFromConfig(cfg)
	lhc, err := lufthansaClient(ctx, cfg)
	if err != nil {
		panic(err)
	}

	lambda.StartWithOptions(newHandler(s3c, lhc), lambda.WithContext(ctx))
}

func lufthansaClient(ctx context.Context, cfg aws.Config) (*lufthansa.Client, error) {
	envNames := []string{"FLIGHTS_SSM_LUFTHANSA_CLIENT_ID", "FLIGHTS_SSM_LUFTHANSA_CLIENT_SECRET"}
	reqNames := make([]string, 0, len(envNames))
	lookup := make(map[string]string)

	for _, envName := range envNames {
		reqName := os.Getenv(envName)
		if reqName == "" {
			return nil, fmt.Errorf("env variable %s required", envName)
		}

		reqNames = append(reqNames, reqName)
		lookup[reqName] = envName
	}

	ssmc := ssm.NewFromConfig(cfg)
	resp, err := ssmc.GetParameters(ctx, &ssm.GetParametersInput{
		Names:          reqNames,
		WithDecryption: aws.Bool(true),
	})

	if err != nil {
		return nil, err
	} else if len(resp.InvalidParameters) > 0 {
		return nil, fmt.Errorf("ssm invalid parameters: %v", resp.InvalidParameters)
	}

	result := make(map[string]string)
	for _, p := range resp.Parameters {
		result[lookup[*p.Name]] = *p.Value
	}

	return lufthansa.NewClient(
		result["FLIGHTS_SSM_LUFTHANSA_CLIENT_ID"],
		result["FLIGHTS_SSM_LUFTHANSA_CLIENT_SECRET"],
		lufthansa.WithRateLimiter(rate.NewLimiter(rate.Every(time.Hour)*490, 1)),
	), nil
}

func newHandler(s3c *s3.Client, lhc *lufthansa.Client) func(ctx context.Context, event InputEvent) (json.RawMessage, error) {
	lCountriesAction := action.NewLoadMetadataAction(s3c, lhc, (*lufthansa.Client).CountriesRaw, "countries")
	lCitiesAction := action.NewLoadMetadataAction(s3c, lhc, (*lufthansa.Client).CitiesRaw, "cities")
	lAirportsAction := action.NewLoadMetadataAction(s3c, lhc, (*lufthansa.Client).AirportsRaw, "airports")
	lAirlinesAction := action.NewLoadMetadataAction(s3c, lhc, (*lufthansa.Client).AirlinesRaw, "airlines")
	lAircraftAction := action.NewLoadMetadataAction(s3c, lhc, (*lufthansa.Client).AircraftRaw, "aircraft")
	lfsAction := action.NewLoadFlightSchedulesAction(s3c, lhc)
	cfsAction := action.NewConvertFlightSchedulesAction(s3c)
	cfAction := action.NewConvertFlightsAction(s3c)
	cronAction := action.NewCronAction(lfsAction, cfsAction)
	loaAction := action.NewLoadOurAirportsDataAction(s3c, nil)
	umdAction := action.NewUpdateMetadataAction(s3c)
	invWHAction := action.NewInvokeWebhookAction(http.DefaultClient)

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

		case "convert_flights":
			return handle(ctx, cfAction, event.Params)

		case "cron":
			return handle(ctx, cronAction, event.Params)

		case "load_our_airports_data":
			return handle(ctx, loaAction, event.Params)

		case "update_metadata":
			return handle(ctx, umdAction, event.Params)

		case "invoke_webhook":
			return handle(ctx, invWHAction, event.Params)
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
