package web

import (
	"cmp"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/lufthansa"
	"github.com/explore-flights/monorepo/go/common/xiter"
	"iter"
	"slices"
)

type SeatMap struct {
	CabinClasses common.Set[string] `json:"cabinClasses"`
	Decks        []*SeatMapDeck     `json:"decks"`
}

type SeatMapDeck struct {
	WingPosition    RowRanges      `json:"wingPosition,omitempty"`
	ExitRowPosition RowRanges      `json:"exitRowPosition,omitempty"`
	Cabins          []SeatMapCabin `json:"cabins"`
}

type SeatMapCabin struct {
	CabinClass       string             `json:"cabinClass"`
	SeatColumns      []string           `json:"seatColumns"`
	ComponentColumns []ColumnIdentifier `json:"componentColumns"`
	Aisle            common.Set[int]    `json:"aisle"`
	Rows             []SeatMapRow       `json:"rows"`
}

type ColumnIdentifier struct {
	Position string `json:"position"`
	Repeat   int    `json:"repeat"`
}

type SeatMapRow struct {
	Number int                `json:"number"`
	Front  [][]*SeatMapColumn `json:"front"`
	Seats  []*SeatMapColumn   `json:"seats"`
	Rear   [][]*SeatMapColumn `json:"rear"`
}

type SeatMapColumn struct {
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

func normalizeSeatMaps(rawSeatMaps map[lufthansa.CabinClass]lufthansa.SeatAvailability) SeatMap {
	sm := SeatMap{
		CabinClasses: make(common.Set[string]),
		Decks:        make([]*SeatMapDeck, 0),
	}

	for cc, rawSeatMap := range rawSeatMaps {
		cc := normalizeCabinClass(cc)
		sm.CabinClasses[cc] = struct{}{}

		main, upper := normalizeSeatMap(cc, rawSeatMap)
		for i, d := range []*SeatMapDeck{main, upper} {
			if d == nil {
				continue
			}

			// remove cabins without rows
			d.Cabins = slices.DeleteFunc(d.Cabins, func(c SeatMapCabin) bool {
				return len(c.Rows) < 1
			})

			if len(d.Cabins) < 1 {
				continue
			}

			for len(sm.Decks) <= i {
				sm.Decks = append(sm.Decks, nil)
			}

			if sm.Decks[i] == nil {
				sm.Decks[i] = d
			} else {
				if len(d.WingPosition) > 0 {
					sm.Decks[i].WingPosition = sm.Decks[i].WingPosition.Expand(d.WingPosition)
				}

				if len(d.ExitRowPosition) > 0 {
					sm.Decks[i].ExitRowPosition = sm.Decks[i].ExitRowPosition.Expand(d.ExitRowPosition)
				}

				sm.Decks[i].Cabins = append(sm.Decks[i].Cabins, d.Cabins...)
			}
		}
	}

	for _, d := range sm.Decks {
		// sort decks by first row number
		slices.SortFunc(d.Cabins, func(a, b SeatMapCabin) int {
			comparator := func(a, b SeatMapRow) int {
				return cmp.Compare(a.Number, b.Number)
			}

			return cmp.Or(
				cmp.Compare(
					slices.MinFunc(a.Rows, comparator).Number,
					slices.MinFunc(b.Rows, comparator).Number,
				),
				cmp.Compare(a.CabinClass, b.CabinClass),
			)
		})
	}

	return sm
}

func normalizeSeatMap(cabinClass string, sm lufthansa.SeatAvailability) (*SeatMapDeck, *SeatMapDeck) {
	var main, upper *SeatMapDeck

	for _, sd := range sm.SeatDisplay {
		details := sm.Details(int(sd.Rows.First), int(sd.Rows.Last))
		isUpper := slices.ContainsFunc(details, func(detail lufthansa.SeatDetail) bool {
			return slices.Contains(detail.Location.Row.Characteristics.Characteristic, lufthansa.SeatCharacteristicUpperDeck)
		})

		var deck *SeatMapDeck
		if isUpper {
			if upper == nil {
				upper = new(SeatMapDeck)
			}

			deck = upper
		} else {
			if main == nil {
				main = new(SeatMapDeck)
			}

			deck = main
		}

		deck.Cabins = append(deck.Cabins, normalizeSeatMapCabin(cabinClass, sd, details))

		if sm.CabinLayout != nil {
			if int(sm.CabinLayout.WingPosition.First) != 0 && int(sm.CabinLayout.WingPosition.Last) != 0 {
				deck.WingPosition = RowRanges{RowRange{int(sm.CabinLayout.WingPosition.First), int(sm.CabinLayout.WingPosition.Last)}}
			}

			if len(sm.CabinLayout.ExitRowPosition) > 0 {
				deck.ExitRowPosition = make(RowRanges, 0)

				for _, erp := range sm.CabinLayout.ExitRowPosition {
					deck.ExitRowPosition = deck.ExitRowPosition.Expand(RowRanges{RowRange{int(erp.First), int(erp.Last)}})
				}
			}
		}
	}

	return main, upper
}

func normalizeSeatMapCabin(cabinClass string, sd lufthansa.SeatDisplay, details []lufthansa.SeatDetail) SeatMapCabin {
	cabin := SeatMapCabin{
		CabinClass:       cabinClass,
		SeatColumns:      make([]string, 0, len(sd.Columns)),
		ComponentColumns: make([]ColumnIdentifier, 0),
		Aisle:            make(common.Set[int]),
		Rows:             make([]SeatMapRow, 0),
	}

	// initialize seat columns
	for _, col := range sd.Columns {
		cabin.SeatColumns = append(cabin.SeatColumns, col.Position)
	}

	// initialize component columns
	for _, comp := range sd.Components {
		repeats := make(map[lufthansa.ComponentColumnCharacteristic]int)

		for _, loc := range comp.Locations.Location {
			repeat := repeats[loc.Column.Position]
			repeat += 1
			repeats[loc.Column.Position] = repeat

			identifier := ColumnIdentifier{
				Position: string(loc.Column.Position),
				Repeat:   repeat,
			}

			if !slices.Contains(cabin.ComponentColumns, identifier) {
				cabin.ComponentColumns = append(cabin.ComponentColumns, identifier)
			}
		}
	}

	slices.SortFunc(cabin.ComponentColumns, func(a, b ColumnIdentifier) int {
		idx := func(v string) int {
			switch v {
			case string(lufthansa.ComponentColumnCharacteristicLeftSide):
				return 0

			case string(lufthansa.ComponentColumnCharacteristicLeftCenter):
				return 1

			case string(lufthansa.ComponentColumnCharacteristicCenter):
				return 2

			case string(lufthansa.ComponentColumnCharacteristicRightCenter):
				return 3

			case string(lufthansa.ComponentColumnCharacteristicRightSide):
				return 4
			}

			return 0
		}

		return cmp.Or(
			cmp.Compare(idx(a.Position), idx(b.Position)),
			cmp.Compare(a.Repeat, b.Repeat),
		)
	})

	// sort seat details by row number and column
	slices.SortFunc(details, func(a, b lufthansa.SeatDetail) int {
		return cmp.Or(
			cmp.Compare(a.Location.Row.Number, b.Location.Row.Number),
			cmp.Compare(
				slices.Index(cabin.SeatColumns, a.Location.Column),
				slices.Index(cabin.SeatColumns, b.Location.Column),
			),
		)
	})

	// build rows
	var currRow SeatMapRow
	detailsOffset := 0
	compOffsetByRow := make(map[lufthansa.SeatDisplayComponentLocationRow]int)

	for compRelativeIdx, comp := range sd.Components {
		colRepeats := make(map[lufthansa.ComponentColumnCharacteristic]int)

		for _, loc := range comp.Locations.Location {
			// add all seats up to (including) this row
			for i := detailsOffset; i < len(details); i++ {
				seatDetail := details[i]
				if seatDetail.Location.Row.Number > loc.Row.Position {
					break
				}

				if isLeftOfAisle(i, details) {
					cabin.Aisle[slices.Index(cabin.SeatColumns, seatDetail.Location.Column)] = struct{}{}
				}

				currRow, cabin.Rows = appendSeat(cabin.SeatColumns, cabin.Rows, currRow, seatDetail)
				detailsOffset = i
			}

			compOffset, ok := compOffsetByRow[loc.Row]
			if !ok {
				compOffset = compRelativeIdx
				compOffsetByRow[loc.Row] = compOffset
			}

			colRepeat := colRepeats[loc.Column.Position]
			colRepeat += 1
			colRepeats[loc.Column.Position] = colRepeat

			identifier := ColumnIdentifier{
				Position: string(loc.Column.Position),
				Repeat:   colRepeat,
			}

			currRow, cabin.Rows = appendComponent(
				cabin.SeatColumns,
				cabin.ComponentColumns,
				cabin.Rows,
				currRow,
				identifier,
				loc,
				compRelativeIdx-compOffset,
			)
		}
	}

	// add all remaining seats
	for i := detailsOffset; i < len(details); i++ {
		seatDetail := details[i]
		if isLeftOfAisle(i, details) {
			cabin.Aisle[slices.Index(cabin.SeatColumns, seatDetail.Location.Column)] = struct{}{}
		}

		currRow, cabin.Rows = appendSeat(cabin.SeatColumns, cabin.Rows, currRow, seatDetail)
	}

	if currRow.Number != 0 {
		cabin.Rows = append(cabin.Rows, currRow)
	}

	return cabin
}

func isLeftOfAisle(i int, details []lufthansa.SeatDetail) bool {
	sd := details[i]
	if slices.Contains(sd.Location.Row.Characteristics.Characteristic, lufthansa.SeatCharacteristicExitRow) {
		// ignore for exit row, those tend to be special
		return false
	}

	if slices.Contains(sd.Location.Row.Characteristics.Characteristic, lufthansa.SeatCharacteristicAisle) {
		row := sd.Location.Row.Number
		if isSameRowAndEmptyOrNextToAisle(i+1, row, details) && !isLeftOfAisle(i+1, details) {
			return true
		}
	}

	return false
}

func isSameRowAndEmptyOrNextToAisle(i int, row lufthansa.JsonStrAsInt, details []lufthansa.SeatDetail) bool {
	if i >= len(details) {
		return false
	}

	sd := details[i]
	return sd.Location.Row.Number == row && (isEmptySeat(sd) || slices.Contains(sd.Location.Row.Characteristics.Characteristic, lufthansa.SeatCharacteristicAisle))
}

func appendSeat(columns []string, rows []SeatMapRow, currRow SeatMapRow, sd lufthansa.SeatDetail) (SeatMapRow, []SeatMapRow) {
	if !isEmptySeat(sd) {
		seatDetailRowNumber := int(sd.Location.Row.Number)

		if currRow.Number != seatDetailRowNumber {
			if currRow.Number != 0 {
				rows = append(rows, currRow)
			}

			currRow = SeatMapRow{
				Number: seatDetailRowNumber,
				Front:  make([][]*SeatMapColumn, 0),
				Seats:  make([]*SeatMapColumn, len(columns)),
				Rear:   make([][]*SeatMapColumn, 0),
			}
		}

		colIdx := slices.Index(columns, sd.Location.Column)
		currRow.Seats[colIdx] = &SeatMapColumn{
			Type:     "seat",
			Features: make([]string, 0, len(sd.Location.Row.Characteristics.Characteristic)),
		}

		for _, c := range sd.Location.Row.Characteristics.Characteristic {
			currRow.Seats[colIdx].Features = append(currRow.Seats[colIdx].Features, string(c))
		}
	}

	return currRow, rows
}

func appendComponent(seatColumns []string, componentColumns []ColumnIdentifier, rows []SeatMapRow, currRow SeatMapRow, identifier ColumnIdentifier, loc lufthansa.SeatDisplayComponentLocation, rowRelativeIdx int) (SeatMapRow, []SeatMapRow) {
	if currRow.Number != int(loc.Row.Position) {
		if currRow.Number != 0 {
			rows = append(rows, currRow)
		}

		currRow = SeatMapRow{
			Number: int(loc.Row.Position),
			Front:  make([][]*SeatMapColumn, 0),
			Seats:  make([]*SeatMapColumn, len(seatColumns)),
			Rear:   make([][]*SeatMapColumn, 0),
		}
	}

	colIdx := slices.Index(componentColumns, identifier)
	col := &SeatMapColumn{
		Type:     "component",
		Features: []string{string(loc.Type)},
	}

	switch loc.Row.Orientation {
	case lufthansa.ComponentRowCharacteristicFront, lufthansa.ComponentRowCharacteristicMiddle:
		for len(currRow.Front) <= rowRelativeIdx {
			currRow.Front = append(currRow.Front, make([]*SeatMapColumn, len(componentColumns)))
		}

		currRow.Front[rowRelativeIdx][colIdx] = col

	case lufthansa.ComponentRowCharacteristicRear:
		for len(currRow.Rear) <= rowRelativeIdx {
			currRow.Rear = append(currRow.Rear, make([]*SeatMapColumn, len(componentColumns)))
		}

		currRow.Rear[rowRelativeIdx][colIdx] = col
	}

	return currRow, rows
}

func isEmptySeat(sd lufthansa.SeatDetail) bool {
	if len(sd.Location.Row.Characteristics.Characteristic) < 1 {
		return true
	}

	return slices.Contains(sd.Location.Row.Characteristics.Characteristic, lufthansa.SeatCharacteristicNoSeatAtLocation)
}

func normalizeCabinClass(cc lufthansa.CabinClass) string {
	switch cc {
	case lufthansa.CabinClassEco:
		return "ECO"

	case lufthansa.CabinClassPremiumEco:
		return "PRECO"

	case lufthansa.CabinClassBusiness:
		return "BIZ"

	case lufthansa.CabinClassFirst:
		return "FIRST"
	}

	return string(cc)
}
