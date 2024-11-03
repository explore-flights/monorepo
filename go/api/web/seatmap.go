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

func deduplicateSeatMaps(rawSeatMaps map[lufthansa.RequestCabinClass]lufthansa.SeatAvailability) {
	type Key struct {
		cc   lufthansa.RequestCabinClass
		rows lufthansa.SeatDisplayRows
	}

	type NonMatch struct {
		cc          lufthansa.RequestCabinClass
		generalized bool
	}

	match := make(common.Set[Key])
	nonMatch := make(map[Key][]NonMatch)

	for cc, seatMap := range rawSeatMaps {
		for _, sd := range seatMap.SeatDisplay {
			generalizedCC, ok := generalizeCabinType(sd.CabinType)
			key := Key{generalizedCC, sd.Rows}

			if ok && cc == generalizedCC {
				match[key] = struct{}{}
			} else {
				nonMatch[key] = append(nonMatch[key], NonMatch{cc, ok})
			}
		}
	}

	for key, nonMatchedRequestCCs := range nonMatch {
		if !match.Contains(key) {
			if len(nonMatchedRequestCCs) > 1 {
				// only remove if there is more than 1 non-matches, keeping the first successfully generalized one, if any
				idx := slices.IndexFunc(nonMatchedRequestCCs, func(nm NonMatch) bool {
					return nm.generalized
				})

				if idx == -1 {
					nonMatchedRequestCCs = nonMatchedRequestCCs[1:]
				} else {
					// replace element at index with the last in slice
					nonMatchedRequestCCs[idx] = nonMatchedRequestCCs[len(nonMatchedRequestCCs)-1]
					// remove the last element
					nonMatchedRequestCCs = nonMatchedRequestCCs[:len(nonMatchedRequestCCs)-1]
				}
			} else {
				// if there is only one, do not remove any
				nonMatchedRequestCCs = nil
			}
		}

		for _, nonMatchedRequestCC := range nonMatchedRequestCCs {
			if sm, ok := rawSeatMaps[nonMatchedRequestCC.cc]; ok {
				sm.SeatDisplay = slices.DeleteFunc(sm.SeatDisplay, func(sd lufthansa.SeatDisplay) bool {
					return sd.Rows == key.rows
				})

				sm.SeatDetails = slices.DeleteFunc(sm.SeatDetails, func(sd lufthansa.SeatDetail) bool {
					return sd.Location.Row.Number >= key.rows.First && sd.Location.Row.Number <= key.rows.Last
				})

				if len(sm.SeatDetails) > 0 || len(sm.SeatDisplay) > 0 {
					rawSeatMaps[nonMatchedRequestCC.cc] = sm
				} else {
					delete(rawSeatMaps, nonMatchedRequestCC.cc)
				}
			}
		}
	}
}

func normalizeSeatMaps(rawSeatMaps map[lufthansa.RequestCabinClass]lufthansa.SeatAvailability) SeatMap {
	deduplicateSeatMaps(rawSeatMaps)

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
			switch lufthansa.ComponentColumnCharacteristic(v) {
			case lufthansa.ComponentColumnCharacteristicLeftSide:
				return 0

			case lufthansa.ComponentColumnCharacteristicLeftCenter:
				return 1

			case lufthansa.ComponentColumnCharacteristicCenter:
				return 2

			case lufthansa.ComponentColumnCharacteristicRightCenter:
				return 3

			case lufthansa.ComponentColumnCharacteristicRightSide:
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
	if i < 0 || i >= len(details) {
		return false
	}

	sd := details[i]
	if sd.Empty() {
		return false
	} else if sd.HasCharacteristic(lufthansa.SeatCharacteristicExitRow) {
		// ignore for exit row, those tend to be special
		return false
	} else if !sd.AisleAccess() {
		return false
	}

	return isSameRow(i+1, sd.Location.Row.Number, details) && isNextToAisle(i+1, details) && !isLeftOfAisle(i+1, details)
}

func isSameRow(i int, row lufthansa.JsonStrAsInt, details []lufthansa.SeatDetail) bool {
	if i < 0 || i >= len(details) {
		return false
	}

	return details[i].Location.Row.Number == row
}

func isNextToAisle(i int, details []lufthansa.SeatDetail) bool {
	if i < 0 || i >= len(details) {
		return true
	}

	return details[i].AisleAccess()
}

func appendSeat(columns []string, rows []SeatMapRow, currRow SeatMapRow, sd lufthansa.SeatDetail) (SeatMapRow, []SeatMapRow) {
	if sd.Empty() {
		return currRow, rows
	}

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

func normalizeCabinClass(cc lufthansa.RequestCabinClass) string {
	switch cc {
	case lufthansa.RequestCabinClassEco:
		return "ECO"

	case lufthansa.RequestCabinClassPremiumEco:
		return "PRECO"

	case lufthansa.RequestCabinClassBusiness:
		return "BIZ"

	case lufthansa.RequestCabinClassFirst:
		return "FIRST"
	}

	return string(cc)
}

func generalizeCabinType(cabinType lufthansa.Code) (lufthansa.RequestCabinClass, bool) {
	switch lufthansa.RequestCabinClass(cabinType) {
	case lufthansa.RequestCabinClassFirst:
		return lufthansa.RequestCabinClassFirst, true

	case lufthansa.RequestCabinClassBusiness:
		return lufthansa.RequestCabinClassBusiness, true

	case lufthansa.RequestCabinClassPremiumEco:
		return lufthansa.RequestCabinClassPremiumEco, true

	case lufthansa.RequestCabinClassEco:
		return lufthansa.RequestCabinClassEco, true
	}

	switch lufthansa.CabinClass(cabinType) {
	case lufthansa.CabinClassFirstClass, lufthansa.CabinClassFirstClassPremium, lufthansa.CabinClassFirstClassDiscounted:
		return lufthansa.RequestCabinClassFirst, true

	case lufthansa.CabinClassBusinessClass, lufthansa.CabinClassBusinessClassPremium, lufthansa.CabinClassBusinessClassDiscounted:
		return lufthansa.RequestCabinClassBusiness, true

	case lufthansa.CabinClassCoachEconomyPremium:
		return lufthansa.RequestCabinClassPremiumEco, true

	case lufthansa.CabinClassCoachEconomy, lufthansa.CabinClassCoachEconomyDiscounted1, lufthansa.CabinClassCoachEconomyDiscounted2, lufthansa.CabinClassCoachEconomyDiscounted3, lufthansa.CabinClassCoachEconomyDiscounted4, lufthansa.CabinClassCoachEconomyDiscounted5:
		return lufthansa.RequestCabinClassEco, true
	}

	return lufthansa.RequestCabinClass(cabinType), false
}
