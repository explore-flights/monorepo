package search

import (
	"fmt"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/goccy/go-graphviz"
	"github.com/goccy/go-graphviz/cgraph"
	"io"
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

func ExportConnectionsImage(w io.Writer, conns []Connection) error {
	g := graphviz.New()
	defer g.Close()

	graph, err := g.Graph()
	if err != nil {
		return err
	}

	if err = buildGraph(nil, conns, graph, make(map[*common.Flight]*cgraph.Node)); err != nil {
		return err
	}

	return g.Render(graph, graphviz.PNG, w)
}

func buildGraph(parent *common.Flight, conns []Connection, graph *cgraph.Graph, lookup map[*common.Flight]*cgraph.Node) error {
	var err error

	for _, conn := range conns {
		var node *cgraph.Node
		var ok bool

		if node, ok = lookup[conn.Flight]; !ok {
			node, err = graph.CreateNode(conn.Flight.Number().String())
			if err != nil {
				return err
			}

			node.SetLabel(fmt.Sprintf("%s\n%s-%s\n%s", conn.Flight.Number().String(), conn.Flight.DepartureAirport, conn.Flight.ArrivalAirport, conn.Flight.AircraftType))
			lookup[conn.Flight] = node
		}

		if parentNode, ok := lookup[parent]; ok {
			var edge *cgraph.Edge
			edge, err = graph.CreateEdge("", parentNode, node)
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
