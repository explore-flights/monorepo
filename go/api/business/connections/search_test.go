package connections

import (
	"context"
	"errors"
	"iter"
	"reflect"
	"slices"
	"testing"
	"time"

	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/common/xtime"
)

var testDate = time.Date(2026, 11, 14, 0, 0, 0, 0, time.UTC)

type evaluatorFunc func(context.Context, Connection) (ConnectionEvaluation, error)

func (f evaluatorFunc) Evaluate(ctx context.Context, connection Connection) (ConnectionEvaluation, error) {
	return f(ctx, connection)
}

type airportFilterFunc func(context.Context, *Airport) (bool, error)

func (f airportFilterFunc) Apply(ctx context.Context, airport *Airport) (bool, error) {
	return f(ctx, airport)
}

func originCodes(codes ...string) AirportFilter {
	return airportFilterFunc(func(_ context.Context, airport *Airport) (bool, error) {
		return slices.Contains(codes, airport.IataCode), nil
	})
}

type testRepo struct {
	flights        []db.Flight
	failure        error
	airports       map[string]db.Airport
	airportFailure error
}

func (r testRepo) IterFlights(ctx context.Context, date xtime.LocalDate, outErr *error) iter.Seq[db.Flight] {
	return func(yield func(db.Flight) bool) {
		if err := ctx.Err(); err != nil {
			*outErr = err
			return
		}
		if r.failure != nil {
			*outErr = r.failure
			return
		}
		for _, flight := range r.flights {
			if xtime.NewLocalDate(flight.DepartureTime.UTC()) == date && !yield(flight) {
				return
			}
		}
	}
}

func (r testRepo) Airports(ctx context.Context) (map[string]db.Airport, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if r.airportFailure != nil {
		return nil, r.airportFailure
	}
	if r.airports != nil {
		return r.airports, nil
	}
	airports := make(map[string]db.Airport)
	for _, flight := range r.flights {
		for _, code := range []string{flight.DepartureAirportIataCode, flight.ArrivalAirportIataCode} {
			airports[code] = db.Airport{IataCode: code}
		}
	}
	return airports, nil
}

func testFlight(number int, from, to string, hour int) db.Flight {
	departure := testDate.Add(time.Duration(hour) * time.Hour)
	return db.Flight{
		FlightNumber:             db.FlightNumber{AirlineIataCode: "LH", Number: number},
		DepartureAirportIataCode: from,
		ArrivalAirportIataCode:   to,
		DepartureTime:            departure,
		ArrivalTime:              departure.Add(time.Hour),
	}
}

func paths(connections []Connection) [][]int {
	result := make([][]int, 0, len(connections))
	for _, connection := range connections {
		path := make([]int, 0, len(connection))
		for _, flight := range connection {
			path = append(path, flight.Number)
		}
		result = append(result, path)
	}
	return result
}

func testContext(t *testing.T) context.Context {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)
	return ctx
}

func yieldQuery() Query {
	return Query{
		MinDeparture:           testDate,
		MaxDeparture:           testDate.Add(24 * time.Hour),
		DepartureAirportFilter: originCodes("A"),
		ConnectionEvaluator: evaluatorFunc(func(context.Context, Connection) (ConnectionEvaluation, error) {
			return ConnectionEvaluation{Yield: true}, nil
		}),
	}
}

func TestTraversalEvaluationsAndIndependentPaths(t *testing.T) {
	repo := testRepo{flights: []db.Flight{
		testFlight(3, "B", "D", 12),
		testFlight(1, "A", "B", 8),
		testFlight(4, "E", "F", 7),
		testFlight(2, "B", "C", 10),
		testFlight(5, "D", "G", 14),
		testFlight(6, "C", "H", 12),
	}}
	query := yieldQuery()
	query.DepartureAirportFilter = originCodes("A", "E")
	query.ConnectionEvaluator = evaluatorFunc(func(_ context.Context, connection Connection) (ConnectionEvaluation, error) {
		switch connection[len(connection)-1].Number {
		case 1:
			return yieldAndProceedEvaluation(), nil
		case 3:
			return ConnectionEvaluation{}, nil
		default:
			return ConnectionEvaluation{Yield: true}, nil
		}
	})
	connections, next, err := NewSearch(repo).FindConnections(testContext(t), query, 10, nil)
	if err != nil || next != nil {
		t.Fatalf("continuation=%+v error=%v", next, err)
	}
	expected := [][]int{{4}, {1}, {1, 2}}
	if got := paths(connections); !reflect.DeepEqual(got, expected) {
		t.Fatalf("got=%v want=%v", got, expected)
	}
	// Expanding a yielded prefix must not append into its previously returned slice.
	if len(connections[1]) != 1 || len(connections[2]) != 2 {
		t.Fatal("returned connection slices share mutable lengths")
	}
}

func TestProceedDoesNotYieldItsPrefix(t *testing.T) {
	query := yieldQuery()
	query.ConnectionEvaluator = evaluatorFunc(func(_ context.Context, connection Connection) (ConnectionEvaluation, error) {
		if len(connection) == 1 {
			return proceedEvaluation(), nil
		}
		return ConnectionEvaluation{Yield: true}, nil
	})
	repo := testRepo{flights: []db.Flight{testFlight(1, "A", "B", 8), testFlight(2, "B", "C", 10)}}
	connections, _, err := NewSearch(repo).FindConnections(testContext(t), query, 10, nil)
	if err != nil || !reflect.DeepEqual(paths(connections), [][]int{{1, 2}}) {
		t.Fatalf("connections=%v error=%v", paths(connections), err)
	}
}

func TestOrderingIsIndependentOfRowAndOriginOrder(t *testing.T) {
	rows := []db.Flight{
		testFlight(10, "A", "B", 8),
		testFlight(1, "E", "F", 8),
		testFlight(9, "A", "B", 8),
	}
	for _, reverse := range []bool{false, true} {
		data := slices.Clone(rows)
		origins := []string{"E", "A"}
		if reverse {
			slices.Reverse(data)
			slices.Reverse(origins)
		}
		query := yieldQuery()
		query.DepartureAirportFilter = originCodes(origins...)
		connections, next, err := NewSearch(testRepo{flights: data}).FindConnections(testContext(t), query, 10, nil)
		if err != nil || next != nil || !reflect.DeepEqual(paths(connections), [][]int{{9}, {10}, {1}}) {
			t.Fatalf("reverse=%v connections=%v continuation=%+v error=%v", reverse, paths(connections), next, err)
		}
	}
}

func TestEvaluatorAndMinimumDeparture(t *testing.T) {
	query := yieldQuery()
	query.MinDeparture = testDate.Add(8 * time.Hour)
	query.ConnectionEvaluator = evaluatorFunc(func(_ context.Context, connection Connection) (ConnectionEvaluation, error) {
		flight := connection[len(connection)-1]
		if flight.Number == 1 || flight.DepartureAirportIataCode != "A" {
			t.Errorf("evaluator received ineligible flight %d", flight.Number)
		}
		return ConnectionEvaluation{Yield: flight.Number != 2}, nil
	})
	repo := testRepo{flights: []db.Flight{
		testFlight(1, "A", "B", 7), testFlight(2, "A", "B", 8),
		testFlight(3, "A", "B", 9), testFlight(4, "E", "F", 9),
	}}
	connections, next, err := NewSearch(repo).FindConnections(testContext(t), query, 10, nil)
	if err != nil || next != nil || !reflect.DeepEqual(paths(connections), [][]int{{3}}) {
		t.Fatalf("connections=%v continuation=%v error=%v", paths(connections), next, err)
	}
}

func TestFailuresPropagate(t *testing.T) {
	failure := errors.New("source failed")
	for _, source := range []string{"repository", "airport repository", "airport filter", "connection evaluator"} {
		t.Run(source, func(t *testing.T) {
			repo := testRepo{flights: []db.Flight{testFlight(1, "A", "B", 8)}}
			query := yieldQuery()
			switch source {
			case "repository":
				repo.failure = failure
			case "airport repository":
				repo.airportFailure = failure
			case "airport filter":
				query.DepartureAirportFilter = airportFilterFunc(func(context.Context, *Airport) (bool, error) {
					return false, failure
				})
			case "connection evaluator":
				query.ConnectionEvaluator = evaluatorFunc(func(context.Context, Connection) (ConnectionEvaluation, error) {
					return ConnectionEvaluation{}, failure
				})
			}
			if _, _, err := NewSearch(repo).FindConnections(testContext(t), query, 10, nil); !errors.Is(err, failure) {
				t.Fatalf("error=%v", err)
			}
		})
	}
}

func TestEmptySearchAndZeroPage(t *testing.T) {
	for _, size := range []uint{0, 10} {
		connections, next, err := NewSearch(testRepo{}).FindConnections(testContext(t), yieldQuery(), size, nil)
		if err != nil || next != nil || len(connections) != 0 {
			t.Fatalf("size=%d connections=%v continuation=%+v error=%v", size, connections, next, err)
		}
	}
}

func TestZeroPagePreservesContinuation(t *testing.T) {
	after := &Continuation{Departure: testDate.Add(8 * time.Hour), Consumed: 3}
	repo := testRepo{failure: errors.New("flight load must be skipped"), airportFailure: errors.New("airport load must be skipped")}
	connections, next, err := NewSearch(repo).FindConnections(testContext(t), yieldQuery(), 0, after)
	if err != nil || next != after || len(connections) != 0 {
		t.Fatalf("connections=%v continuation=%+v error=%v", paths(connections), next, err)
	}
}

func TestCallerCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(testContext(t))
	cancel()
	repo := testRepo{flights: []db.Flight{testFlight(1, "A", "B", 8)}}
	if _, _, err := NewSearch(repo).FindConnections(ctx, yieldQuery(), 10, nil); !errors.Is(err, context.Canceled) {
		t.Fatalf("error=%v", err)
	}
}

// Regression: ending a page is successful cancellation of the producer, not a
// caller-visible context cancellation. There are more results than fit this page.
func TestFullPageStopsProducerWithoutReturningCancellation(t *testing.T) {
	repo := testRepo{flights: []db.Flight{
		testFlight(1, "A", "B", 8),
		testFlight(2, "A", "B", 8),
		testFlight(3, "A", "B", 8),
	}}
	connections, next, err := NewSearch(repo).FindConnections(testContext(t), yieldQuery(), 1, nil)
	if err != nil {
		t.Fatalf("a full page must succeed: %v", err)
	}
	if !reflect.DeepEqual(paths(connections), [][]int{{1}}) || next == nil || next.Consumed != 1 {
		t.Fatalf("connections=%v continuation=%+v", paths(connections), next)
	}
}

// Regression: the consumed count includes replayed entries exactly once.
func TestContinuationDoesNotDoubleCountSkippedConnections(t *testing.T) {
	repo := testRepo{flights: []db.Flight{testFlight(1, "A", "B", 8), testFlight(2, "A", "B", 8)}}
	after := &Continuation{Departure: testDate.Add(8 * time.Hour), Consumed: 1}
	connections, next, err := NewSearch(repo).FindConnections(testContext(t), yieldQuery(), 1, after)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(paths(connections), [][]int{{2}}) {
		t.Fatalf("connections=%v", paths(connections))
	}
	// An exact final page may have a continuation, but its offset must be correct.
	if next != nil && next.Consumed != 2 {
		t.Fatalf("consumed=%d want=2", next.Consumed)
	}
}

func TestContinuationSkipsOnlyItsBoundaryTimestamp(t *testing.T) {
	repo := testRepo{flights: []db.Flight{
		testFlight(1, "A", "B", 7),
		testFlight(2, "A", "B", 8),
		testFlight(3, "A", "B", 8),
		testFlight(4, "A", "B", 9),
	}}
	after := &Continuation{Departure: testDate.Add(8 * time.Hour), Consumed: 1}
	connections, next, err := NewSearch(repo).FindConnections(testContext(t), yieldQuery(), 10, after)
	if err != nil || next != nil || !reflect.DeepEqual(paths(connections), [][]int{{3}, {4}}) {
		t.Fatalf("connections=%v continuation=%+v error=%v", paths(connections), next, err)
	}
}

// Returning from a cancelled request must also finish producer cleanup.
func TestCallerCancellationWaitsForProducer(t *testing.T) {
	testCtx := testContext(t)
	ctx, cancel := context.WithCancel(testCtx)
	defer cancel()
	entered := make(chan struct{})
	cleaningUp := make(chan struct{})
	allowCleanup := make(chan struct{})
	exited := make(chan struct{})
	finished := make(chan error, 1)
	query := yieldQuery()
	query.ConnectionEvaluator = evaluatorFunc(func(ctx context.Context, _ Connection) (ConnectionEvaluation, error) {
		defer close(exited)
		close(entered)
		<-ctx.Done()
		close(cleaningUp)
		select {
		case <-allowCleanup:
		case <-testCtx.Done():
		}
		return ConnectionEvaluation{}, ctx.Err()
	})
	search := NewSearch(testRepo{flights: []db.Flight{testFlight(1, "A", "B", 8)}})
	go func() {
		_, _, err := search.FindConnections(ctx, query, 10, nil)
		finished <- err
	}()
	select {
	case <-entered:
	case <-testCtx.Done():
		t.Fatal(testCtx.Err())
	}
	cancel()
	select {
	case <-cleaningUp:
	case <-testCtx.Done():
		t.Fatal(testCtx.Err())
	}
	returned := false
	var result error
	select {
	case result = <-finished:
		returned = true
		t.Error("FindConnections returned before producer cleanup completed")
	case <-time.After(50 * time.Millisecond):
	}
	close(allowCleanup)
	if !returned {
		select {
		case result = <-finished:
		case <-testCtx.Done():
			t.Fatal(testCtx.Err())
		}
	}
	if !errors.Is(result, context.Canceled) {
		t.Fatalf("error=%v", result)
	}
	select {
	case <-exited:
	default:
		t.Error("producer still running after FindConnections returned")
	}
}

func TestPagingRoundTripAtOneDepartureTimestamp(t *testing.T) {
	search := NewSearch(testRepo{flights: []db.Flight{
		testFlight(3, "A", "B", 8),
		testFlight(1, "A", "B", 8),
		testFlight(2, "A", "B", 8),
	}})
	var after *Continuation
	combined := make([]Connection, 0)
	for page := 0; page < 4; page++ {
		connections, next, err := search.FindConnections(testContext(t), yieldQuery(), 1, after)
		if err != nil {
			t.Fatal(err)
		}
		combined = append(combined, connections...)
		if next == nil {
			break
		}
		after = next
	}
	if got := paths(combined); !reflect.DeepEqual(got, [][]int{{1}, {2}, {3}}) {
		t.Fatalf("paged connections=%v", got)
	}
}

func TestContinuationResetsAtNextDepartureTimestamp(t *testing.T) {
	search := NewSearch(testRepo{flights: []db.Flight{
		testFlight(1, "A", "B", 8),
		testFlight(2, "A", "B", 8),
		testFlight(3, "A", "B", 9),
	}})
	connections, next, err := search.FindConnections(testContext(t), yieldQuery(), 3, nil)
	if err != nil || !reflect.DeepEqual(paths(connections), [][]int{{1}, {2}, {3}}) {
		t.Fatalf("connections=%v error=%v", paths(connections), err)
	}
	if next != nil && (!next.Departure.Equal(testDate.Add(9*time.Hour)) || next.Consumed != 1) {
		t.Fatalf("continuation=%+v", next)
	}
}

func TestDepartureAirportFilterOnlySelectsRoots(t *testing.T) {
	repo := testRepo{
		airports: map[string]db.Airport{
			"A": {IataCode: "A", CountryCode: "DE"},
			"B": {IataCode: "B", CountryCode: "US"},
			"C": {IataCode: "C", CountryCode: "DE"},
		},
		flights: []db.Flight{
			testFlight(1, "A", "B", 8),
			testFlight(2, "B", "D", 10),
			testFlight(3, "C", "D", 8),
		},
	}
	for _, country := range []string{"DE", "XX"} {
		t.Run(country, func(t *testing.T) {
			query := yieldQuery()
			query.DepartureAirportFilter = airportFilterFunc(func(_ context.Context, a *Airport) (bool, error) {
				return a.CountryCode == country, nil
			})
			query.ConnectionEvaluator = evaluatorFunc(func(_ context.Context, c Connection) (ConnectionEvaluation, error) {
				if len(c) == 1 && c[0].Number == 1 {
					return proceedEvaluation(), nil
				}
				return ConnectionEvaluation{Yield: true}, nil
			})
			connections, next, err := NewSearch(repo).FindConnections(testContext(t), query, 10, nil)
			want := [][]int{{1, 2}, {3}}
			if country == "XX" {
				want = [][]int{}
			}
			if err != nil || next != nil || !reflect.DeepEqual(paths(connections), want) {
				t.Fatalf("connections=%v continuation=%v error=%v", paths(connections), next, err)
			}
		})
	}
}

func TestContinuationConsumedDoesNotOverflowPageSize(t *testing.T) {
	repo := testRepo{flights: []db.Flight{testFlight(1, "A", "B", 8)}}
	after := &Continuation{Departure: testDate.Add(8 * time.Hour), Consumed: ^uint32(0)}
	connections, next, err := NewSearch(repo).FindConnections(testContext(t), yieldQuery(), 1, after)
	if err != nil || len(connections) != 0 || next != nil {
		t.Fatalf("connections=%v continuation=%v error=%v", paths(connections), next, err)
	}
}

func TestIterFlightsAcrossEmptyUTCDates(t *testing.T) {
	repo := testRepo{flights: []db.Flight{
		testFlight(3, "A", "B", 49),
		testFlight(1, "A", "B", 23),
		testFlight(2, "A", "B", 49),
		testFlight(4, "E", "B", 24),
		testFlight(5, "A", "B", 21),
	}}
	var loadErr error
	var numbers []int
	loader := flightLoader{repo: repo, watermark: testDate, flightsCache: make(map[xtime.LocalDate]map[string][]*Flight)}
	for flight := range loader.iterFlights(testContext(t), testDate.Add(22*time.Hour), testDate.Add(72*time.Hour), []string{"A"}, &loadErr) {
		numbers = append(numbers, flight.Number)
		if len(numbers) == 3 {
			break
		}
	}
	if loadErr != nil || !reflect.DeepEqual(numbers, []int{1, 2, 3}) {
		t.Fatalf("flights=%v error=%v", numbers, loadErr)
	}
}

func TestCrossDateConnectionFillsPage(t *testing.T) {
	repo := testRepo{flights: []db.Flight{
		testFlight(2, "B", "C", 49),
		testFlight(1, "A", "B", 23),
	}}
	query := yieldQuery()
	query.ConnectionEvaluator = evaluatorFunc(func(_ context.Context, connection Connection) (ConnectionEvaluation, error) {
		if len(connection) == 1 {
			return proceedEvaluation(), nil
		}
		return ConnectionEvaluation{Yield: true}, nil
	})
	connections, next, err := NewSearch(repo).FindConnections(testContext(t), query, 1, nil)
	if err != nil || !reflect.DeepEqual(paths(connections), [][]int{{1, 2}}) || next == nil || !next.Departure.Equal(repo.flights[1].DepartureTime) || next.Consumed != 1 {
		t.Fatalf("connections=%v continuation=%v error=%v", paths(connections), next, err)
	}
}

type recordingFlightRepo struct {
	testRepo
	dates []xtime.LocalDate
}

func (r *recordingFlightRepo) IterFlights(ctx context.Context, date xtime.LocalDate, outErr *error) iter.Seq[db.Flight] {
	return func(yield func(db.Flight) bool) {
		r.dates = append(r.dates, date)
		r.testRepo.IterFlights(ctx, date, outErr)(yield)
	}
}

func TestFlightLoaderReadsBoundedDates(t *testing.T) {
	repo := &recordingFlightRepo{testRepo: testRepo{flights: []db.Flight{
		testFlight(1, "A", "B", 6*24+8),
		testFlight(2, "A", "B", 13*24+8),
		testFlight(3, "A", "B", 14*24+8),
	}}}
	var loadErr error
	var numbers []int
	loader := flightLoader{repo: repo, watermark: testDate, flightsCache: make(map[xtime.LocalDate]map[string][]*Flight)}
	for flight := range loader.iterFlights(testContext(t), testDate, testDate.Add(14*24*time.Hour), []string{"A"}, &loadErr) {
		numbers = append(numbers, flight.Number)
	}
	if loadErr != nil || !reflect.DeepEqual(numbers, []int{1, 2}) || len(repo.dates) != 15 {
		t.Fatalf("flights=%v dates=%v error=%v", numbers, repo.dates, loadErr)
	}
}

func TestSearchWithoutCallerDeadline(t *testing.T) {
	query := yieldQuery()
	query.ConnectionEvaluator = evaluatorFunc(func(ctx context.Context, _ Connection) (ConnectionEvaluation, error) {
		if deadline, ok := ctx.Deadline(); ok {
			t.Errorf("unexpected deadline: %v", deadline)
		}
		return ConnectionEvaluation{Yield: true}, nil
	})
	repo := testRepo{flights: []db.Flight{testFlight(1, "A", "B", 8)}}
	connections, _, err := NewSearch(repo).FindConnections(context.Background(), query, 1, nil)
	if err != nil || len(connections) != 1 {
		t.Fatalf("connections=%v error=%v", paths(connections), err)
	}
}

func TestEarlyTimeoutReturnsResumablePartialPage(t *testing.T) {
	ctx, cancel := context.WithTimeout(testContext(t), 1200*time.Millisecond)
	defer cancel()
	repo := testRepo{flights: []db.Flight{
		testFlight(1, "A", "B", 8),
		testFlight(2, "A", "B", 9),
		testFlight(3, "A", "B", 10),
	}}
	query := yieldQuery()
	stopped := make(chan struct{})
	query.ConnectionEvaluator = evaluatorFunc(func(ctx context.Context, conn Connection) (ConnectionEvaluation, error) {
		switch conn[0].Number {
		case 2:
			return ConnectionEvaluation{}, nil
		case 3:
			<-ctx.Done()
			close(stopped)
			return ConnectionEvaluation{}, ctx.Err()
		default:
			return ConnectionEvaluation{Yield: true}, nil
		}
	})
	search := NewSearch(repo)
	first, next, err := search.FindConnections(ctx, query, 10, nil)
	if err != nil || next == nil || !reflect.DeepEqual(paths(first), [][]int{{1}}) {
		t.Fatalf("connections=%v continuation=%+v error=%v", paths(first), next, err)
	}
	if !next.Departure.Equal(repo.flights[0].DepartureTime) || next.Consumed != 1 {
		t.Fatalf("continuation=%+v", next)
	}
	select {
	case <-stopped:
	default:
		t.Fatal("producer did not finish before returning the partial page")
	}
	if err := ctx.Err(); err != nil {
		t.Fatalf("caller context expired before delivering the page: %v", err)
	}

	query.ConnectionEvaluator = evaluatorFunc(func(_ context.Context, conn Connection) (ConnectionEvaluation, error) {
		return ConnectionEvaluation{Yield: conn[0].Number != 2}, nil
	})
	rest, next, err := search.FindConnections(testContext(t), query, 10, next)
	if err != nil || next != nil || !reflect.DeepEqual(paths(rest), [][]int{{3}}) {
		t.Fatalf("resumed connections=%v continuation=%+v error=%v", paths(rest), next, err)
	}
}

func proceedEvaluation() ConnectionEvaluation {
	maxLayover := 72 * time.Hour
	return ConnectionEvaluation{Next: &LayoverWindow{MaxLayover: &maxLayover}}
}

func yieldAndProceedEvaluation() ConnectionEvaluation {
	result := proceedEvaluation()
	result.Yield = true
	return result
}

func TestEvaluatorLayoverWindowBoundsNextFlights(t *testing.T) {
	root := testFlight(1, "A", "B", 23)
	rows := []db.Flight{root}
	for _, candidate := range []struct {
		number  int
		layover time.Duration
	}{
		{2, 74 * time.Minute},
		{3, 75 * time.Minute},
		{4, 6 * time.Hour},
		{5, 6*time.Hour + time.Minute},
	} {
		flight := testFlight(candidate.number, "B", "C", 24)
		flight.DepartureTime = root.ArrivalTime.Add(candidate.layover)
		flight.ArrivalTime = flight.DepartureTime.Add(time.Hour)
		rows = append(rows, flight)
	}
	query := yieldQuery()
	query.ConnectionEvaluator = evaluatorFunc(func(_ context.Context, connection Connection) (ConnectionEvaluation, error) {
		if len(connection) == 1 {
			maxLayover := 6 * time.Hour
			return ConnectionEvaluation{Next: &LayoverWindow{MinLayover: 75 * time.Minute, MaxLayover: &maxLayover}}, nil
		}
		return ConnectionEvaluation{Yield: true}, nil
	})
	connections, next, err := NewSearch(testRepo{flights: rows}).FindConnections(testContext(t), query, 10, nil)
	if err != nil || next != nil || !reflect.DeepEqual(paths(connections), [][]int{{1, 3}, {1, 4}}) {
		t.Fatalf("connections=%v continuation=%v error=%v", paths(connections), next, err)
	}
}

func TestRootDepartureWindowDoesNotRestrictConnectingFlights(t *testing.T) {
	repo := &recordingFlightRepo{testRepo: testRepo{flights: []db.Flight{
		testFlight(1, "A", "B", 7),
		testFlight(2, "A", "B", 8),
		testFlight(3, "A", "B", 10),
		testFlight(4, "A", "B", 11),
		testFlight(5, "B", "C", 25),
	}}}
	query := yieldQuery()
	query.MinDeparture = testDate.Add(8 * time.Hour)
	query.MaxDeparture = testDate.Add(10 * time.Hour)
	query.ConnectionEvaluator = evaluatorFunc(func(_ context.Context, connection Connection) (ConnectionEvaluation, error) {
		if len(connection) == 1 {
			if connection[0].Number != 2 && connection[0].Number != 3 {
				t.Errorf("evaluator received root outside departure window: %d", connection[0].Number)
			}
			return proceedEvaluation(), nil
		}
		return ConnectionEvaluation{Yield: true}, nil
	})
	connections, next, err := NewSearch(repo).FindConnections(testContext(t), query, 10, nil)
	if err != nil || next != nil || !reflect.DeepEqual(paths(connections), [][]int{{2, 5}, {3, 5}}) {
		t.Fatalf("connections=%v continuation=%v error=%v", paths(connections), next, err)
	}
	date := xtime.NewLocalDate(testDate)
	if len(repo.dates) == 0 || repo.dates[0] != date {
		t.Fatalf("root load was not restricted to departure dates: dates=%v", repo.dates)
	}
}

func TestFlightLoaderCachesDatesAndReusesFlightPointers(t *testing.T) {
	repo := &recordingFlightRepo{testRepo: testRepo{flights: []db.Flight{
		testFlight(2, "A", "C", 8),
		testFlight(1, "A", "B", 8),
		testFlight(3, "B", "C", 9),
	}}}
	loader := flightLoader{repo: repo, watermark: testDate, flightsCache: make(map[xtime.LocalDate]map[string][]*Flight)}
	ctx := testContext(t)
	var loadErr error
	var first []*Flight
	for flight := range loader.iterFlights(ctx, testDate, testDate.Add(10*time.Hour), []string{"A"}, &loadErr) {
		first = append(first, flight)
	}
	if loadErr != nil || len(first) != 2 || first[0].Number != 1 || first[1].Number != 2 {
		t.Fatalf("flights=%v error=%v", first, loadErr)
	}
	var second []*Flight
	for flight := range loader.iterFlights(ctx, testDate.Add(8*time.Hour), testDate.Add(9*time.Hour), []string{"A"}, &loadErr) {
		second = append(second, flight)
	}
	if loadErr != nil || len(second) != 2 || first[0] != second[0] || first[1] != second[1] {
		t.Fatalf("cached flights changed: first=%v second=%v error=%v", first, second, loadErr)
	}
	var otherOrigin []int
	for flight := range loader.iterFlights(ctx, testDate, testDate.Add(10*time.Hour), []string{"B"}, &loadErr) {
		otherOrigin = append(otherOrigin, flight.Number)
	}
	if loadErr != nil || !reflect.DeepEqual(otherOrigin, []int{3}) {
		t.Fatalf("other origin flights=%v error=%v", otherOrigin, loadErr)
	}
	// Empty dates are cached too.
	for range 2 {
		for flight := range loader.iterFlights(ctx, testDate.Add(24*time.Hour), testDate.Add(25*time.Hour), []string{"A"}, &loadErr) {
			t.Errorf("unexpected flight on empty date: %d", flight.Number)
		}
	}
	if loadErr != nil || len(repo.dates) != 2 {
		t.Fatalf("date loads=%v error=%v", repo.dates, loadErr)
	}
}

func TestFlightLoaderWatermarkEvictsOnlyEarlierDates(t *testing.T) {
	repo := &recordingFlightRepo{testRepo: testRepo{flights: []db.Flight{
		testFlight(1, "A", "B", 8),
		testFlight(2, "A", "B", 26),
		testFlight(3, "A", "B", 50),
	}}}
	loader := flightLoader{repo: repo, watermark: testDate, flightsCache: make(map[xtime.LocalDate]map[string][]*Flight)}
	ctx := testContext(t)
	var loadErr error
	for range loader.iterFlights(ctx, testDate, testDate.Add(60*time.Hour), []string{"A"}, &loadErr) {
	}
	if loadErr != nil {
		t.Fatal(loadErr)
	}
	loader.moveWatermark(testDate.Add(25 * time.Hour))
	date := xtime.NewLocalDate(testDate)
	if _, retained := loader.flightsCache[date]; retained || len(loader.flightsCache) != 2 {
		t.Fatalf("cached dates after watermark: %v", loader.flightsCache)
	}
	var numbers []int
	for flight := range loader.iterFlights(ctx, testDate.Add(25*time.Hour), testDate.Add(60*time.Hour), []string{"A"}, &loadErr) {
		numbers = append(numbers, flight.Number)
	}
	if loadErr != nil || !reflect.DeepEqual(numbers, []int{2, 3}) || len(repo.dates) != 3 {
		t.Fatalf("flights=%v loads=%v error=%v", numbers, repo.dates, loadErr)
	}
	for flight := range loader.iterFlights(ctx, testDate.Add(24*time.Hour), testDate.Add(60*time.Hour), []string{"A"}, &loadErr) {
		t.Errorf("unexpected flight before watermark: %d", flight.Number)
	}
	if loadErr == nil || len(repo.dates) != 3 {
		t.Fatalf("expected watermark rejection without loading: loads=%v error=%v", repo.dates, loadErr)
	}
}
