package web

import (
	"slices"

	"github.com/explore-flights/monorepo/go/api/business/connections"
)

// connectionNode is the web response's tree projection of complete journeys.
type connectionNode struct {
	Flight   *connections.Flight
	Outgoing []connectionNode
}

func connectionTree(journeys []connections.Connection) []connectionNode {
	result := make([]connectionNode, 0)
	for _, journey := range journeys {
		result = insertJourney(result, journey)
	}
	return result
}

func insertJourney(nodes []connectionNode, path []*connections.Flight) []connectionNode {
	if len(path) == 0 {
		return nodes
	}
	first := path[0]
	index := slices.IndexFunc(nodes, func(node connectionNode) bool {
		// A yielded prefix needs its own leaf alongside any longer journeys.
		return node.Flight == first && (len(node.Outgoing) == 0) == (len(path) == 1)
	})
	if index < 0 {
		index = len(nodes)
		nodes = append(nodes, connectionNode{
			Flight:   first,
			Outgoing: make([]connectionNode, 0),
		})
	}
	nodes[index].Outgoing = insertJourney(nodes[index].Outgoing, path[1:])
	return nodes
}
