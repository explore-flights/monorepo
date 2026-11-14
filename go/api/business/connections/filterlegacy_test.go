package connections

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/explore-flights/monorepo/go/api/db"
)

func legacyConnectionEvaluator() LegacyConnectionEvaluator {
	airlines, airports, aircraft := filterCatalogs()
	return LegacyConnectionEvaluator{
		Destinations: []string{"LAX"},
		MaxFlights:   2,
		MinLayover:   45 * time.Minute,
		MaxLayover:   time.Hour,
		MaxDuration:  7*time.Hour + 20*time.Minute,
		Airlines:     airlines, Airports: airports, Aircraft: aircraft,
	}
}

func TestLegacyAirportFilter(t *testing.T) {
	for _, origins := range [][]string{nil, {"FRA", "JFK"}} {
		filter := LegacyAirportFilter{Origins: origins}
		for _, code := range []string{"FRA", "MUC", "JFK"} {
			accepted, err := filter.Apply(testContext(t), &Airport{db.Airport{IataCode: code}})
			want := len(origins) > 0 && code != "MUC"
			if err != nil || accepted != want {
				t.Fatalf("origins=%v code=%s accepted=%v error=%v", origins, code, accepted, err)
			}
		}
	}
}

func TestLegacyEvaluatorFlightExclusions(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func(*LegacyConnectionEvaluator, *Flight)
		want   bool
	}{
		{"scheduled", func(*LegacyConnectionEvaluator, *Flight) {}, true},
		{"rail", func(_ *LegacyConnectionEvaluator, f *Flight) { f.ServiceType = "U" }, true},
		{"other service", func(_ *LegacyConnectionEvaluator, f *Flight) { f.ServiceType = "C" }, false},
		{"exclude departure", func(f *LegacyConnectionEvaluator, _ *Flight) { f.ExcludeAirport = []string{"FRA"} }, false},
		{"exclude arrival glob", func(f *LegacyConnectionEvaluator, _ *Flight) { f.ExcludeAirport = []string{"MU?"} }, false},
		{"exclude ICAO airport glob", func(f *LegacyConnectionEvaluator, _ *Flight) { f.ExcludeAirport = []string{"EDD*"} }, false},
		{"literal ICAO airport", func(f *LegacyConnectionEvaluator, _ *Flight) { f.ExcludeAirport = []string{"EDDF"} }, true},
		{"exclude operating number", func(f *LegacyConnectionEvaluator, _ *Flight) { f.ExcludeFlightNumber = []string{"LH400A"} }, false},
		{"exclude ICAO number", func(f *LegacyConnectionEvaluator, _ *Flight) { f.ExcludeFlightNumber = []string{"DLH400A"} }, false},
		{"exclude number glob", func(f *LegacyConnectionEvaluator, _ *Flight) { f.ExcludeFlightNumber = []string{"DLH4*"} }, false},
		{"codeshare is ignored", func(f *LegacyConnectionEvaluator, _ *Flight) { f.ExcludeFlightNumber = []string{"UA900"} }, true},
		{"exclude aircraft", func(f *LegacyConnectionEvaluator, _ *Flight) { f.ExcludeAircraft = []string{"359"} }, false},
		{"exclude ICAO aircraft glob", func(f *LegacyConnectionEvaluator, _ *Flight) { f.ExcludeAircraft = []string{"A35?"} }, false},
		{"exclude aircraft name", func(f *LegacyConnectionEvaluator, _ *Flight) { f.ExcludeAircraft = []string{"Airbus*"} }, false},
		{"literal aircraft name", func(f *LegacyConnectionEvaluator, _ *Flight) { f.ExcludeAircraft = []string{"Airbus A350-900"} }, true},
		{"nonmatching exclusions", func(f *LegacyConnectionEvaluator, _ *Flight) {
			f.ExcludeAirport = []string{"JFK"}
			f.ExcludeAircraft = []string{"32*"}
			f.ExcludeFlightNumber = []string{"LH123"}
		}, true},
		{"malformed glob is literal", func(f *LegacyConnectionEvaluator, _ *Flight) { f.ExcludeFlightNumber = []string{"LH["} }, true},
		{"missing metadata exact match", func(f *LegacyConnectionEvaluator, _ *Flight) {
			f.Airports = nil
			f.ExcludeAirport = []string{"FRA"}
		}, false},
		{"missing metadata airport glob", func(f *LegacyConnectionEvaluator, _ *Flight) {
			f.Airports = nil
			f.ExcludeAirport = []string{"FR*"}
		}, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			evaluator := legacyConnectionEvaluator()
			evaluator.Destinations = []string{"MUC"}
			flight := *filterConnection()[0]
			test.change(&evaluator, &flight)
			result, err := evaluator.Evaluate(testContext(t), Connection{&flight})
			if err != nil || result != (ConnectionEvaluation{Yield: test.want}) {
				t.Fatalf("evaluation=%v want yield=%v error=%v", result, test.want, err)
			}
		})
	}
}

func TestLegacyConnectionEvaluator(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func(*LegacyConnectionEvaluator)
		want   ConnectionEvaluation
	}{
		{"inclusive bounds and same number layover", func(*LegacyConnectionEvaluator) {}, ConnectionEvaluation{Yield: true}},
		{"physical legs", func(f *LegacyConnectionEvaluator) { f.CountMultiLeg = true }, ConnectionEvaluation{}},
		{"physical legs allowed", func(f *LegacyConnectionEvaluator) { f.CountMultiLeg = true; f.MaxFlights = 3 }, ConnectionEvaluation{Yield: true}},
		{"too many flight groups", func(f *LegacyConnectionEvaluator) { f.MaxFlights = 1 }, ConnectionEvaluation{}},
		{"zero max flights", func(f *LegacyConnectionEvaluator) { f.MaxFlights = 0 }, ConnectionEvaluation{}},
		{"short journey bound", func(f *LegacyConnectionEvaluator) { f.MaxDuration -= time.Hour + time.Nanosecond }, ConnectionEvaluation{}},
		{"zero journey bound", func(f *LegacyConnectionEvaluator) { f.MaxDuration = 0 }, ConnectionEvaluation{}},
		{"long layover", func(f *LegacyConnectionEvaluator) { f.MaxLayover -= time.Nanosecond }, ConnectionEvaluation{}},
		{"short transfer", func(f *LegacyConnectionEvaluator) { f.MinLayover = time.Hour + time.Nanosecond }, ConnectionEvaluation{}},
		{"inclusive min layover", func(f *LegacyConnectionEvaluator) { f.MinLayover = time.Hour }, ConnectionEvaluation{Yield: true}},
		{"not at destination", func(f *LegacyConnectionEvaluator) { f.Destinations = []string{"SFO"} }, proceedEvaluation()},
		{"inclusions across legs", func(f *LegacyConnectionEvaluator) {
			f.IncludeAirport = []string{"FRA", "JFK"}
			f.IncludeFlightNumber = []string{"DLH400A", "LH401B"}
			f.IncludeAircraft = []string{"359", "Airbus*"}
		}, ConnectionEvaluation{Yield: true}},
		{"glob inclusions", func(f *LegacyConnectionEvaluator) {
			f.IncludeAirport = []string{"EDD*", "J?K"}
			f.IncludeFlightNumber = []string{"DLH4*"}
			f.IncludeAircraft = []string{"A35?"}
		}, ConnectionEvaluation{Yield: true}},
		{"airport alternatives", func(f *LegacyConnectionEvaluator) { f.IncludeAirport = []string{"FRA", "SFO"} }, ConnectionEvaluation{Yield: true}},
		{"flight alternatives", func(f *LegacyConnectionEvaluator) { f.IncludeFlightNumber = []string{"LH400A", "LH999"} }, ConnectionEvaluation{Yield: true}},
		{"aircraft alternatives", func(f *LegacyConnectionEvaluator) { f.IncludeAircraft = []string{"359", "320"} }, ConnectionEvaluation{Yield: true}},
		{"categories are AND connected", func(f *LegacyConnectionEvaluator) {
			f.IncludeAirport = []string{"FRA", "SFO"}
			f.IncludeFlightNumber = []string{"LH400A", "LH999"}
			f.IncludeAircraft = []string{"320", "32*"}
		}, proceedEvaluation()},
		{"all category alternatives satisfied", func(f *LegacyConnectionEvaluator) {
			f.IncludeAirport = []string{"FRA", "SFO"}
			f.IncludeFlightNumber = []string{"LH400A", "LH999"}
			f.IncludeAircraft = []string{"320", "Airbus*"}
		}, ConnectionEvaluation{Yield: true}},
		{"unmet airport at destination", func(f *LegacyConnectionEvaluator) { f.IncludeAirport = []string{"SFO"} }, proceedEvaluation()},
		{"unmet flight at destination", func(f *LegacyConnectionEvaluator) { f.IncludeFlightNumber = []string{"LH999"} }, proceedEvaluation()},
		{"codeshare inclusion ignored", func(f *LegacyConnectionEvaluator) { f.IncludeFlightNumber = []string{"UA900"} }, proceedEvaluation()},
		{"unmet inclusion may match later", func(f *LegacyConnectionEvaluator) {
			f.Destinations = []string{"SFO"}
			f.IncludeAirport = []string{"SFO"}
		}, proceedEvaluation()},
	} {
		t.Run(test.name, func(t *testing.T) {
			filter := legacyConnectionEvaluator()
			test.change(&filter)
			decision, err := filter.Evaluate(testContext(t), filterConnection())
			if err != nil || decision.Yield != test.want.Yield || (decision.Next == nil) != (test.want.Next == nil) {
				t.Fatalf("decision=%v want=%v error=%v", decision, test.want, err)
			}
		})
	}
	if decision, err := legacyConnectionEvaluator().Evaluate(testContext(t), nil); err != nil || decision != (ConnectionEvaluation{}) {
		t.Fatalf("empty connection: decision=%v error=%v", decision, err)
	}
	filter := legacyConnectionEvaluator()
	filter.MaxFlights = 1
	if decision, err := filter.Evaluate(testContext(t), filterConnection()[:2]); err != nil || decision.Next == nil {
		t.Fatalf("same-number continuation at max flights: decision=%v error=%v", decision, err)
	}
	filter.MaxLayover = 19 * time.Minute
	if decision, err := filter.Evaluate(testContext(t), filterConnection()[:2]); err != nil || decision != (ConnectionEvaluation{}) {
		t.Fatalf("same-number max layover: decision=%v error=%v", decision, err)
	}
}

func TestLegacyAdaptersCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := (LegacyAirportFilter{}).Apply(ctx, &Airport{}); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}

	if _, err := legacyConnectionEvaluator().Evaluate(ctx, filterConnection()); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
}

func TestLegacyAdaptersWithSearch(t *testing.T) {
	data := filterConnection()
	_, airports, _ := filterCatalogs()
	repo := testRepo{flights: []db.Flight{data[0].Flight, data[1].Flight, data[2].Flight}, airports: airports}
	evaluator := legacyConnectionEvaluator()
	evaluator.Destinations = []string{"JFK", "LAX"}
	evaluator.IncludeAirport = []string{"FRA", "JFK"}
	query := Query{
		MinDeparture:           testDate,
		MaxDeparture:           testDate.Add(8 * time.Hour),
		DepartureAirportFilter: LegacyAirportFilter{Origins: []string{"FRA"}},
		ConnectionEvaluator:    evaluator,
	}
	connections, next, err := NewSearch(repo).FindConnections(testContext(t), query, 10, nil)
	if err != nil || next != nil || !reflect.DeepEqual(paths(connections), [][]int{{400, 400}}) {
		t.Fatalf("connections=%v continuation=%v error=%v", paths(connections), next, err)
	}
	// Reaching JFK with an unmet inclusion keeps the branch available for LAX.
	evaluator.IncludeAirport = []string{"LAX"}
	query.ConnectionEvaluator = evaluator
	connections, _, err = NewSearch(repo).FindConnections(testContext(t), query, 10, nil)
	if err != nil || !reflect.DeepEqual(paths(connections), [][]int{{400, 400, 401}}) {
		t.Fatalf("connections=%v error=%v", paths(connections), err)
	}
}

func TestLegacyEvaluatorBoundsRemainingJourney(t *testing.T) {
	filter := legacyConnectionEvaluator()
	filter.MaxLayover = 6 * time.Hour
	prefix := filterConnection()[:2]
	filter.MaxDuration = prefix[1].ArrivalTime.Sub(prefix[0].DepartureTime) + 30*time.Minute
	result, err := filter.Evaluate(testContext(t), prefix)
	if err != nil || result.Yield || result.Next == nil || result.Next.MinLayover != 0 || result.Next.MaxLayover == nil || *result.Next.MaxLayover != 30*time.Minute {
		t.Fatalf("evaluation=%+v error=%v", result, err)
	}
	filter.MaxDuration -= 30 * time.Minute
	result, err = filter.Evaluate(testContext(t), prefix)
	if err != nil || result != (ConnectionEvaluation{}) {
		t.Fatalf("exhausted journey evaluation=%+v error=%v", result, err)
	}
}
