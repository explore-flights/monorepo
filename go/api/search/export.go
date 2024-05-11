package search

import (
	"fmt"
	"github.com/explore-flights/monorepo/go/common"
	"io"
	"slices"
	"strings"
	"time"
)

type ConnectionsResponse struct {
	Connections []ConnectionResponse      `json:"connections"`
	Flights     map[string]FlightResponse `json:"flights"`
}

type ConnectionResponse struct {
	FlightId string               `json:"flightId"`
	Outgoing []ConnectionResponse `json:"outgoing"`
}

type FlightResponse struct {
	FlightNumber     FlightNumberResponse   `json:"flightNumber"`
	DepartureTime    time.Time              `json:"departureTime"`
	DepartureAirport string                 `json:"departureAirport"`
	ArrivalTime      time.Time              `json:"arrivalTime"`
	ArrivalAirport   string                 `json:"arrivalAirport"`
	AircraftOwner    string                 `json:"aircraftOwner"`
	AircraftType     string                 `json:"aircraftType"`
	Registration     string                 `json:"registration,omitempty"`
	CodeShares       []FlightNumberResponse `json:"codeShares"`
}

type FlightNumberResponse struct {
	Airline string `json:"airline"`
	Number  int    `json:"number"`
	Suffix  string `json:"suffix,omitempty"`
}

func ExportConnectionsText(w io.Writer, conns []Connection) error {
	_, err := printConnections(w, conns, time.Time{}, 0)
	return err
}

func printConnections(w io.Writer, conns []Connection, prevArrive time.Time, indent int) (int, error) {
	var total int
	var n int
	var err error

	prefix := strings.Repeat("\t", indent)

	slices.SortFunc(conns, func(a, b Connection) int {
		return a.Flight.DepartureTime.Compare(b.Flight.DepartureTime)
	})

	for _, conn := range conns {
		var suffix string
		if prevArrive.IsZero() {
			suffix = fmt.Sprintf("\t(%v)", conn.Flight.DepartureTime.Format(time.DateOnly))
		} else {
			suffix = fmt.Sprintf("\t(%v layover)", conn.Flight.DepartureTime.Sub(prevArrive))
		}

		n, err = fmt.Fprintf(w, "%s%7s\t%v-%v%s\n", prefix, conn.Flight.Number().String(), conn.Flight.DepartureAirport, conn.Flight.ArrivalAirport, suffix)
		total += n
		if err != nil {
			return total, err
		}

		n, err = printConnections(w, conn.Outgoing, conn.Flight.ArrivalTime, indent+1)
		total += n
		if err != nil {
			return total, err
		}
	}

	return total, nil
}

func ExportConnectionsJson(conns []Connection) ConnectionsResponse {
	flights := make(map[string]FlightResponse)
	connections := buildConnectionsResponse(conns, flights)

	return ConnectionsResponse{
		Connections: connections,
		Flights:     flights,
	}
}

func buildConnectionsResponse(conns []Connection, flights map[string]FlightResponse) []ConnectionResponse {
	r := make([]ConnectionResponse, 0, len(conns))

	for _, conn := range conns {
		flightId := fmt.Sprintf("%v@%v@%v", conn.Flight.Number(), conn.Flight.DepartureAirport, conn.Flight.DepartureDate())
		if _, ok := flights[flightId]; !ok {
			flights[flightId] = FlightResponse{
				FlightNumber: FlightNumberResponse{
					Airline: string(conn.Flight.Airline),
					Number:  conn.Flight.FlightNumber,
					Suffix:  conn.Flight.Suffix,
				},
				DepartureTime:    conn.Flight.DepartureTime,
				DepartureAirport: conn.Flight.DepartureAirport,
				ArrivalTime:      conn.Flight.ArrivalTime,
				ArrivalAirport:   conn.Flight.ArrivalAirport,
				AircraftOwner:    string(conn.Flight.AircraftOwner),
				AircraftType:     conn.Flight.AircraftType,
				Registration:     conn.Flight.Registration,
				CodeShares:       convertCodeShares(conn.Flight.CodeShares),
			}
		}

		r = append(r, ConnectionResponse{
			FlightId: flightId,
			Outgoing: buildConnectionsResponse(conn.Outgoing, flights),
		})
	}

	return r
}

func convertCodeShares(inp []common.FlightNumber) []FlightNumberResponse {
	r := make([]FlightNumberResponse, 0, len(inp))
	for _, fn := range inp {
		r = append(r, FlightNumberResponse{
			Airline: string(fn.Airline),
			Number:  fn.Number,
			Suffix:  fn.Suffix,
		})
	}

	return r
}
