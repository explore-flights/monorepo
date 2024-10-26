package search

import (
	"context"
	"fmt"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/goccy/go-graphviz"
	"github.com/goccy/go-graphviz/cgraph"
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
		fid := conn.Flight.Id()
		if _, ok := flights[fid]; !ok {
			flights[fid] = FlightResponse{
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
			FlightId: fid,
			Outgoing: buildConnectionsResponse(conn.Outgoing, flights),
		})
	}

	return r
}

func convertCodeShares(inp map[common.FlightNumber]common.CodeShare) []FlightNumberResponse {
	r := make([]FlightNumberResponse, 0, len(inp))
	for fn := range inp {
		r = append(r, FlightNumberResponse{
			Airline: string(fn.Airline),
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

	if err = buildGraph(nil, conns, graph, make(map[*common.Flight]*cgraph.Node)); err != nil {
		return err
	}

	return g.Render(ctx, graph, graphviz.PNG, w)
}

func buildGraph(parent *common.Flight, conns []Connection, graph *cgraph.Graph, lookup map[*common.Flight]*cgraph.Node) error {
	var err error

	for _, conn := range conns {
		var node *cgraph.Node
		var ok bool

		if node, ok = lookup[conn.Flight]; !ok {
			node, err = graph.CreateNodeByName(conn.Flight.Id().String())
			if err != nil {
				return err
			}

			node.SetLabel(fmt.Sprintf("%s\n%s-%s\n%s", conn.Flight.Number().String(), conn.Flight.DepartureAirport, conn.Flight.ArrivalAirport, conn.Flight.AircraftType))
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
