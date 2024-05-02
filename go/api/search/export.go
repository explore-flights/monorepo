package search

import (
	"fmt"
	"github.com/dominikbraun/graph"
	"github.com/dominikbraun/graph/draw"
	"github.com/explore-flights/monorepo/go/common"
	"io"
	"slices"
	"strings"
	"time"
)

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

func ExportConnectionsImage(w io.Writer, conns []Connection) error {
	g := graph.New((*common.Flight).Number, graph.Directed())

	if err := buildGraph(nil, conns, g); err != nil {
		return err
	}

	return draw.DOT(g, w)
}

func buildGraph(parent *common.Flight, conns []Connection, g graph.Graph[common.FlightNumber, *common.Flight]) error {
	var err error

	for _, conn := range conns {
		_ = g.AddVertex(conn.Flight, graph.VertexAttribute("label", fmt.Sprintf("%s\n%s-%s\n%s", conn.Flight.Number().String(), conn.Flight.DepartureAirport, conn.Flight.ArrivalAirport, conn.Flight.AircraftType)))

		if parent != nil {
			_ = g.AddEdge(parent.Number(), conn.Flight.Number(), graph.EdgeAttribute("label", conn.Flight.DepartureTime.Sub(parent.ArrivalTime).String()))
		}

		if err = buildGraph(conn.Flight, conn.Outgoing, g); err != nil {
			return err
		}
	}

	return nil
}
