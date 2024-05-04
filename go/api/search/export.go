package search

import (
	"fmt"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/goccy/go-graphviz"
	"github.com/goccy/go-graphviz/cgraph"
	"io"
	"slices"
	"strings"
	"time"
)

type Reactflow struct {
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
}

type Node struct {
	Id    int    `json:"id"`
	X     int    `json:"x"`
	Y     int    `json:"y"`
	Label string `json:"label"`
}

type Edge struct {
	Source int    `json:"source"`
	Target int    `json:"target"`
	Label  string `json:"label"`
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

func ExportConnectionsImage(w io.Writer, conns []Connection, format graphviz.Format) error {
	g := graphviz.New()
	defer g.Close()

	graph, err := g.Graph()
	if err != nil {
		return err
	}

	if err = buildGraph(nil, conns, graph, make(map[*common.Flight]*cgraph.Node)); err != nil {
		return err
	}

	return g.Render(graph, format, w)
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

func ExportConnectionsReactflow(conns []Connection) Reactflow {
	var rf Reactflow
	buildReactFlow(conns, &rf, 0, 0, nil, make(map[*common.Flight]int))
	return rf
}

func buildReactFlow(conns []Connection, rf *Reactflow, id, y int, parent *common.Flight, lookup map[*common.Flight]int) int {
	const xIncr = 200
	const yIncr = 100

	x := 0

	for _, conn := range conns {
		var nodeId int
		var ok bool

		if nodeId, ok = lookup[conn.Flight]; !ok {
			nodeId = id
			lookup[conn.Flight] = nodeId
			rf.Nodes = append(rf.Nodes, Node{
				Id:    nodeId,
				X:     x,
				Y:     y,
				Label: fmt.Sprintf("%s\n%s-%s\n%s", conn.Flight.Number().String(), conn.Flight.DepartureAirport, conn.Flight.ArrivalAirport, conn.Flight.AircraftType),
			})

			id++
		}

		if parent != nil {
			rf.Edges = append(rf.Edges, Edge{
				Source: lookup[parent],
				Target: nodeId,
				Label:  conn.Flight.DepartureTime.Sub(parent.ArrivalTime).String(),
			})
		}

		id = buildReactFlow(conn.Outgoing, rf, id, y+yIncr, conn.Flight, lookup)
		x += xIncr
	}

	return id
}
