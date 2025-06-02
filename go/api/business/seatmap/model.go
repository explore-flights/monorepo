package seatmap

import (
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/xiter"
	"iter"
	"slices"
)

type SeatMap struct {
	CabinClasses common.Set[string] `json:"cabinClasses"`
	Decks        []*Deck            `json:"decks"`
}

type Deck struct {
	WingPosition    RowRanges `json:"wingPosition,omitempty"`
	ExitRowPosition RowRanges `json:"exitRowPosition,omitempty"`
	Cabins          []Cabin   `json:"cabins"`
}

type Cabin struct {
	CabinClass       string             `json:"cabinClass"`
	SeatColumns      []string           `json:"seatColumns"`
	ComponentColumns []ColumnIdentifier `json:"componentColumns"`
	Aisle            common.Set[int]    `json:"aisle"`
	Rows             []Row              `json:"rows"`
}

type ColumnIdentifier struct {
	Position string `json:"position"`
	Repeat   int    `json:"repeat"`
}

type Row struct {
	Number int         `json:"number"`
	Front  [][]*Column `json:"front"`
	Seats  []*Column   `json:"seats"`
	Rear   [][]*Column `json:"rear"`
}

type Column struct {
	Type     string   `json:"type"`
	Features []string `json:"features"`
}

type RowRange [2]int

type RowRanges []RowRange

func (rr RowRanges) Expand(other RowRanges) RowRanges {
	if len(other) < 1 {
		return rr
	}

	iterSingle := func(rr RowRange) iter.Seq[int] {
		return func(yield func(int) bool) {
			for i := rr[0]; i <= rr[1]; i++ {
				if !yield(i) {
					return
				}
			}
		}
	}

	iterAll := func(rr RowRanges) iter.Seq[int] {
		iters := make([]iter.Seq[int], len(rr))
		for i, r := range rr {
			iters[i] = iterSingle(r)
		}

		return xiter.Combine(iters...)
	}

	result := make(RowRanges, 0, max(len(rr), len(other)))
	var curr RowRange

	for _, row := range slices.Sorted(xiter.Combine(iterAll(rr), iterAll(other))) {
		if curr[0] == 0 {
			curr[0] = row
		}

		if curr[1] != 0 && curr[1] != row && curr[1] != (row-1) {
			result = append(result, curr)
			curr[0] = row
		}

		curr[1] = row
	}

	if curr[1] != 0 {
		result = append(result, curr)
	}

	return result
}
