package search

import (
	"context"
	"fmt"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/goccy/go-graphviz"
	"github.com/goccy/go-graphviz/cgraph"
	"github.com/gofrs/uuid/v5"
	"io"
	"time"
)

type ConnectionsResponse struct {
	Connections []ConnectionResponse               `json:"connections"`
	Flights     map[common.FlightId]FlightResponse `json:"flights"`
}

type ConnectionResponse struct {
	FlightId common.FlightId      `json:"flightId"`
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

func ExportConnectionsJson(conns []Connection) ConnectionsResponse {
	flights := make(map[common.FlightId]FlightResponse)
	connections := buildConnectionsResponse(conns, flights)

	return ConnectionsResponse{
		Connections: connections,
		Flights:     flights,
	}
}

func buildConnectionsResponse(conns []Connection, flights map[common.FlightId]FlightResponse) []ConnectionResponse {
	r := make([]ConnectionResponse, 0, len(conns))

	for _, conn := range conns {
		iataAirline, ok := conn.Flight.IataAirline()
		if !ok {
			continue
		}

		iataDepartureAirport, ok := conn.Flight.IataDepartureAirport()
		if !ok {
			continue
		}

		iataArrivalAirport, ok := conn.Flight.IataArrivalAirport()
		if !ok {
			continue
		}

		iataAircraftType, ok := conn.Flight.IataAircraftType()
		if !ok {
			continue
		}

		fid := common.FlightId{
			Number: common.FlightNumber{
				Airline: common.AirlineIdentifier(iataAirline),
				Number:  conn.Flight.Number,
				Suffix:  conn.Flight.Suffix,
			},
			Departure: common.Departure{
				Airport: iataDepartureAirport,
				Date:    xtime.NewLocalDate(conn.Flight.DepartureTime),
			},
		}

		if _, ok := flights[fid]; !ok {
			flights[fid] = FlightResponse{
				FlightNumber: FlightNumberResponse{
					Airline: iataAirline,
					Number:  conn.Flight.Number,
					Suffix:  conn.Flight.Suffix,
				},
				DepartureTime:    conn.Flight.DepartureTime,
				DepartureAirport: iataDepartureAirport,
				ArrivalTime:      conn.Flight.ArrivalTime,
				ArrivalAirport:   iataArrivalAirport,
				AircraftOwner:    conn.Flight.AircraftOwner,
				AircraftType:     iataAircraftType,
				Registration:     conn.Flight.AircraftRegistration,
				CodeShares:       convertCodeShares(conn.Flight.airlines, conn.Flight.CodeShares),
			}
		}

		r = append(r, ConnectionResponse{
			FlightId: fid,
			Outgoing: buildConnectionsResponse(conn.Outgoing, flights),
		})
	}

	return r
}

func convertCodeShares(airlines map[uuid.UUID]db.Airline, inp common.Set[db.FlightNumber]) []FlightNumberResponse {
	r := make([]FlightNumberResponse, 0, len(inp))
	for fn := range inp {
		airline, ok := airlines[fn.AirlineId]
		if !ok || !airline.IataCode.Valid {
			continue
		}

		r = append(r, FlightNumberResponse{
			Airline: airline.IataCode.String,
			Number:  fn.Number,
			Suffix:  fn.Suffix,
		})
	}

	return r
}

func ExportConnectionsImage(ctx context.Context, w io.Writer, conns []Connection) error {
	g, err := graphviz.New(ctx)
	if err != nil {
		return err
	}

	defer g.Close()

	graph, err := g.Graph()
	if err != nil {
		return err
	}

	if err = buildGraph(nil, conns, graph, make(map[*Flight]*cgraph.Node)); err != nil {
		return err
	}

	return g.Render(ctx, graph, graphviz.PNG, w)
}

func buildGraph(parent *Flight, conns []Connection, graph *cgraph.Graph, lookup map[*Flight]*cgraph.Node) error {
	var err error

	for _, conn := range conns {
		iataNumber, ok := conn.Flight.IataNumber()
		if !ok {
			continue
		}

		iataDepartureAirport, ok := conn.Flight.IataDepartureAirport()
		if !ok {
			continue
		}

		iataArrivalAirport, ok := conn.Flight.IataArrivalAirport()
		if !ok {
			continue
		}

		iataAircraftType, ok := conn.Flight.IataAircraftType()
		if !ok {
			continue
		}

		var node *cgraph.Node
		if node, ok = lookup[conn.Flight]; !ok {
			node, err = graph.CreateNodeByName(fmt.Sprintf("%s@%s@%s", iataNumber, iataDepartureAirport, xtime.NewLocalDate(conn.Flight.DepartureTime)))
			if err != nil {
				return err
			}

			node.SetLabel(fmt.Sprintf("%s\n%s-%s\n%s", iataNumber, iataDepartureAirport, iataArrivalAirport, iataAircraftType))
			lookup[conn.Flight] = node
		}

		if parentNode, ok := lookup[parent]; ok {
			var edge *cgraph.Edge
			edge, err = graph.CreateEdgeByName("", parentNode, node)
			if err != nil {
				return err
			}

			edge.SetLabel(conn.Flight.DepartureTime.Sub(parent.ArrivalTime).String())
		}

		if err = buildGraph(conn.Flight, conn.Outgoing, graph, lookup); err != nil {
			return err
		}
	}

	return nil
}
