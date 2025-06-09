package seatmap

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"github.com/explore-flights/monorepo/go/common/lufthansa"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/gofrs/uuid/v5"
	"maps"
	"net/http"
	"slices"
	"time"
)

var ErrNotFound = errors.New("not found")

type searchRepo interface {
	FlightSchedules(ctx context.Context, fn db.FlightNumber, version time.Time) (db.FlightSchedules, error)
	Airlines(ctx context.Context) (map[uuid.UUID]db.Airline, error)
	Airports(ctx context.Context) (map[uuid.UUID]db.Airport, error)
}

type Search struct {
	s3c interface {
		adapt.S3Getter
		adapt.S3Putter
	}
	bucket string
	repo   searchRepo
	lhc    *lufthansa.Client
}

func NewSearch(s3c interface {
	adapt.S3Getter
	adapt.S3Putter
}, bucket string, repo searchRepo, lhc *lufthansa.Client) *Search {
	return &Search{
		s3c:    s3c,
		bucket: bucket,
		repo:   repo,
		lhc:    lhc,
	}
}

func (s *Search) SeatMap(ctx context.Context, fn db.FlightNumber, departureAirportId uuid.UUID, departureDateLocal xtime.LocalDate) (SeatMap, error) {
	fs, err := s.repo.FlightSchedules(ctx, fn, time.Now())
	if err != nil {
		return SeatMap{}, err
	}

	idx := slices.IndexFunc(fs.Items, func(item db.FlightScheduleItem) bool {
		return item.DepartureAirportId == departureAirportId && item.DepartureDateLocal == departureDateLocal
	})
	if idx == -1 {
		return SeatMap{}, ErrNotFound
	}

	item := fs.Items[idx]
	if !item.FlightVariantId.Valid {
		return SeatMap{}, ErrNotFound
	}

	variant, ok := fs.Variants[item.FlightVariantId.V]
	if !ok {
		return SeatMap{}, ErrNotFound
	}

	return s.loadSeatMap(ctx, fn, departureAirportId, variant, departureDateLocal)
}

func (s *Search) loadSeatMap(ctx context.Context, fn db.FlightNumber, departureAirportId uuid.UUID, variant db.FlightScheduleVariant, departureDateLocal xtime.LocalDate) (SeatMap, error) {
	var airline db.Airline
	var departureAirport db.Airport
	var arrivalAirport db.Airport
	{
		airlines, err := s.repo.Airlines(ctx)
		if err != nil {
			return SeatMap{}, err
		}

		airline = airlines[fn.AirlineId]
	}
	{
		airports, err := s.repo.Airports(ctx)
		if err != nil {
			return SeatMap{}, err
		}

		departureAirport = airports[departureAirportId]
		arrivalAirport = airports[variant.ArrivalAirportId]
	}

	rawSeatMaps := make(map[lufthansa.RequestCabinClass]lufthansa.SeatAvailability)
	cabinClasses := []lufthansa.RequestCabinClass{
		lufthansa.RequestCabinClassEco,
		lufthansa.RequestCabinClassPremiumEco,
		lufthansa.RequestCabinClassBusiness,
		lufthansa.RequestCabinClassFirst,
	}

	for _, cabinClass := range cabinClasses {
		sm, err := s.loadSeatMapInternal(ctx, fn, airline, departureAirport, arrivalAirport, departureDateLocal, variant, cabinClass)
		if err != nil {
			return SeatMap{}, err
		}

		if sm != nil {
			rawSeatMaps[cabinClass] = *sm
		}
	}

	return s.normalizeSeatMaps(rawSeatMaps), nil
}

func (s *Search) loadSeatMapInternal(ctx context.Context, fn db.FlightNumber, airline db.Airline, departureAirport, arrivalAirport db.Airport, departureDateLocal xtime.LocalDate, variant db.FlightScheduleVariant, cabinClass lufthansa.RequestCabinClass) (*lufthansa.SeatAvailability, error) {
	s3Key := s.seatMapS3Key(
		airline.Id,
		variant.AircraftId,
		variant.AircraftConfigurationVersion,
		cabinClass,
	)

	sm, exists, err := s.loadSeatMapFromS3(ctx, s3Key)
	if err != nil {
		return nil, err
	}

	if exists {
		return sm, nil
	}

	today := xtime.NewLocalDate(time.Now().UTC())
	if departureDateLocal <= today {
		return nil, ErrNotFound
	}

	sm, err = s.loadSeatMapFromLH(
		ctx,
		common.FlightNumber{
			Airline: common.AirlineIdentifier(airline.IataCode),
			Number:  fn.Number,
			Suffix:  fn.Suffix,
		},
		departureAirport.IataCode,
		arrivalAirport.IataCode,
		departureDateLocal,
		cabinClass,
	)
	if err != nil {
		return nil, err
	}

	_ = adapt.S3PutJson(ctx, s.s3c, s.bucket, s3Key, sm)

	return sm, nil
}

func (s *Search) loadSeatMapFromLH(ctx context.Context, fn common.FlightNumber, departureAirport, arrivalAirport string, departureDate xtime.LocalDate, cabinClass lufthansa.RequestCabinClass) (*lufthansa.SeatAvailability, error) {
	sm, err := s.lhc.SeatMap(
		ctx,
		fn.String(),
		departureAirport,
		arrivalAirport,
		departureDate,
		cabinClass,
	)

	if err != nil {
		var rse lufthansa.ResponseStatusErr
		if errors.As(err, &rse) && rse.StatusCode == http.StatusNotFound {
			return nil, nil
		} else {
			return nil, err
		}
	}

	return &sm, nil
}

func (s *Search) loadSeatMapFromS3(ctx context.Context, s3Key string) (*lufthansa.SeatAvailability, bool, error) {
	resp, err := s.s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(s3Key),
	})

	if err != nil {
		if adapt.IsS3NotFound(err) {
			return nil, false, nil
		} else {
			return nil, false, err
		}
	}

	defer resp.Body.Close()

	var sm *lufthansa.SeatAvailability
	if err := json.NewDecoder(resp.Body).Decode(&sm); err != nil {
		return nil, false, err
	}

	return sm, true, nil
}

func (s *Search) seatMapS3Key(airlineId, aircraftId uuid.UUID, aircraftConfigurationVersion string, cabinClass lufthansa.RequestCabinClass) string {
	return fmt.Sprintf("tmp/seatmap/%s/%s/%s/%s.json", airlineId.String(), aircraftId.String(), aircraftConfigurationVersion, cabinClass)
}

func (s *Search) deduplicateSeatMaps(rawSeatMaps map[lufthansa.RequestCabinClass]lufthansa.SeatAvailability) {
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
			generalizedCC, ok := s.generalizeCabinType(sd.CabinType)
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

func (s *Search) normalizeSeatMaps(rawSeatMaps map[lufthansa.RequestCabinClass]lufthansa.SeatAvailability) SeatMap {
	s.deduplicateSeatMaps(rawSeatMaps)

	sm := SeatMap{
		CabinClasses: make(common.Set[string]),
		Decks:        make([]*Deck, 0),
	}

	for rawCc, rawSeatMap := range rawSeatMaps {
		cc := s.normalizeCabinClass(rawCc)
		sm.CabinClasses[cc] = struct{}{}

		main, upper := s.normalizeSeatMap(rawCc, cc, rawSeatMap)
		for i, d := range []*Deck{main, upper} {
			if d == nil {
				continue
			}

			// remove cabins without rows
			d.Cabins = slices.DeleteFunc(d.Cabins, func(c Cabin) bool {
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
		slices.SortFunc(d.Cabins, func(a, b Cabin) int {
			comparator := func(a, b Row) int {
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

func (s *Search) normalizeSeatMap(rawCc lufthansa.RequestCabinClass, cabinClass string, sm lufthansa.SeatAvailability) (*Deck, *Deck) {
	var main, upper *Deck

	for _, sd := range sm.SeatDisplay {
		details := sm.Details(int(sd.Rows.First), int(sd.Rows.Last))
		isUpper := slices.ContainsFunc(details, func(detail lufthansa.SeatDetail) bool {
			return slices.Contains(detail.Location.Row.Characteristics.Characteristic, lufthansa.SeatCharacteristicUpperDeck)
		})

		var deck *Deck
		if isUpper {
			if upper == nil {
				upper = new(Deck)
			}

			deck = upper
		} else {
			if main == nil {
				main = new(Deck)
			}

			deck = main
		}

		deck.Cabins = append(deck.Cabins, s.normalizeSeatMapCabin(rawCc, cabinClass, sd, details))

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

func (s *Search) normalizeSeatMapCabin(rawCc lufthansa.RequestCabinClass, cabinClass string, sd lufthansa.SeatDisplay, details []lufthansa.SeatDetail) Cabin {
	cabin := Cabin{
		CabinClass:       cabinClass,
		SeatColumns:      make([]string, 0, len(sd.Columns)),
		ComponentColumns: make([]ColumnIdentifier, 0),
		Aisle:            nil,
		Rows:             make([]Row, 0),
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

	// remove empty seats
	details = slices.DeleteFunc(details, func(sd lufthansa.SeatDetail) bool {
		return sd.Empty()
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
	var currRow Row
	detailsOffset := 0
	compOffsetByRow := make(map[lufthansa.SeatDisplayComponentLocationRow]int)
	aisleByRow := make(map[int]common.Set[int])

	for compRelativeIdx, comp := range sd.Components {
		colRepeats := make(map[lufthansa.ComponentColumnCharacteristic]int)

		for _, loc := range comp.Locations.Location {
			// add all seats up to (including) this row
			for i := detailsOffset; i < len(details); i++ {
				seatDetail := details[i]
				if seatDetail.Location.Row.Number > loc.Row.Position {
					break
				}

				if s.isLeftOfAisle(i, details) {
					aisle, ok := aisleByRow[int(seatDetail.Location.Row.Number)]
					if !ok {
						aisle = make(common.Set[int])
						aisleByRow[int(seatDetail.Location.Row.Number)] = aisle
					}

					aisle[slices.Index(cabin.SeatColumns, seatDetail.Location.Column)] = struct{}{}
				}

				currRow, cabin.Rows = s.appendSeat(cabin.SeatColumns, cabin.Rows, currRow, seatDetail)
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

			currRow, cabin.Rows = s.appendComponent(
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
		if s.isLeftOfAisle(i, details) {
			aisle, ok := aisleByRow[int(seatDetail.Location.Row.Number)]
			if !ok {
				aisle = make(common.Set[int])
				aisleByRow[int(seatDetail.Location.Row.Number)] = aisle
			}

			aisle[slices.Index(cabin.SeatColumns, seatDetail.Location.Column)] = struct{}{}
		}

		currRow, cabin.Rows = s.appendSeat(cabin.SeatColumns, cabin.Rows, currRow, seatDetail)
	}

	if currRow.Number != 0 {
		cabin.Rows = append(cabin.Rows, currRow)
	}

	cabin.Aisle = s.findCorrectAisle(rawCc, cabin.SeatColumns, aisleByRow)

	return cabin
}

func (s *Search) findCorrectAisle(rawCc lufthansa.RequestCabinClass, columns []string, aisleByRow map[int]common.Set[int]) common.Set[int] {
	var commonAisleConfigs [][]int
	switch rawCc {
	case lufthansa.RequestCabinClassEco:
		commonAisleConfigs = [][]int{
			{slices.Index(columns, "C")},
			{slices.Index(columns, "C"), slices.Index(columns, "G")},
		}

	case lufthansa.RequestCabinClassPremiumEco:
		commonAisleConfigs = [][]int{
			{slices.Index(columns, "C")},
			{slices.Index(columns, "C"), slices.Index(columns, "G")},
		}

	case lufthansa.RequestCabinClassBusiness:
		commonAisleConfigs = [][]int{
			{slices.Index(columns, "C")},
			{slices.Index(columns, "C"), slices.Index(columns, "G")},
			{slices.Index(columns, "A"), slices.Index(columns, "F")}, // SQ business a380
		}

	case lufthansa.RequestCabinClassFirst:
		commonAisleConfigs = [][]int{
			{slices.Index(columns, "C")},
			{slices.Index(columns, "A")}, // SQ first a380
			{slices.Index(columns, "C"), slices.Index(columns, "G")},
			{slices.Index(columns, "A"), slices.Index(columns, "G")}, // LH first 747
		}
	}

	maxScore := 0
	maxScoreRows := make([]int, 0)

	for row, aisle := range aisleByRow {
		if len(aisle) >= 1 && len(aisle) <= 2 {
			score := 0

			for otherRow, otherAisle := range aisleByRow {
				if row != otherRow && maps.Equal(aisle, otherAisle) {
					score += 1
				}
			}

			for _, commonConfig := range commonAisleConfigs {
				if len(aisle) == len(commonConfig) {
					match := true
					for _, col := range commonConfig {
						if !aisle.Contains(col) {
							match = false
							break
						}
					}

					if match {
						score += 1
						break
					}
				}
			}

			if score > maxScore {
				maxScore = score
				maxScoreRows = []int{row}
			} else if score == maxScore && !slices.Contains(maxScoreRows, row) {
				maxScoreRows = append(maxScoreRows, row)
			}
		}
	}

	if len(maxScoreRows) < 1 {
		return make(common.Set[int])
	}

	slices.Sort(maxScoreRows)
	return aisleByRow[maxScoreRows[len(maxScoreRows)/2]]
}

func (s *Search) isLeftOfAisle(i int, details []lufthansa.SeatDetail) bool {
	if i < 0 || i >= len(details) {
		return false
	}

	sd := details[i]
	if !sd.AisleAccess() {
		return false
	}

	return s.isSameRow(i+1, sd.Location.Row.Number, details) && s.isNextToAisle(i+1, details) && !s.isLeftOfAisle(i+1, details)
}

func (s *Search) isSameRow(i int, row lufthansa.JsonStrAsInt, details []lufthansa.SeatDetail) bool {
	if i < 0 || i >= len(details) {
		return false
	}

	return details[i].Location.Row.Number == row
}

func (s *Search) isFirstOrLastRowWithinCabin(i int, details []lufthansa.SeatDetail) bool {
	if i < 0 || i >= len(details) {
		return false
	}

	row := details[i].Location.Row.Number
	return details[0].Location.Row.Number == row || details[len(details)-1].Location.Row.Number == row
}

func (s *Search) isNextToAisle(i int, details []lufthansa.SeatDetail) bool {
	if i < 0 || i >= len(details) {
		return true
	}

	return details[i].AisleAccess()
}

func (s *Search) appendSeat(columns []string, rows []Row, currRow Row, sd lufthansa.SeatDetail) (Row, []Row) {
	seatDetailRowNumber := int(sd.Location.Row.Number)

	if currRow.Number != seatDetailRowNumber {
		if currRow.Number != 0 {
			rows = append(rows, currRow)
		}

		currRow = Row{
			Number: seatDetailRowNumber,
			Front:  make([][]*Column, 0),
			Seats:  make([]*Column, len(columns)),
			Rear:   make([][]*Column, 0),
		}
	}

	colIdx := slices.Index(columns, sd.Location.Column)
	currRow.Seats[colIdx] = &Column{
		Type:     "seat",
		Features: make([]string, 0, len(sd.Location.Row.Characteristics.Characteristic)),
	}

	for _, c := range sd.Location.Row.Characteristics.Characteristic {
		currRow.Seats[colIdx].Features = append(currRow.Seats[colIdx].Features, string(c))
	}

	return currRow, rows
}

func (s *Search) appendComponent(seatColumns []string, componentColumns []ColumnIdentifier, rows []Row, currRow Row, identifier ColumnIdentifier, loc lufthansa.SeatDisplayComponentLocation, rowRelativeIdx int) (Row, []Row) {
	if currRow.Number != int(loc.Row.Position) {
		if currRow.Number != 0 {
			rows = append(rows, currRow)
		}

		currRow = Row{
			Number: int(loc.Row.Position),
			Front:  make([][]*Column, 0),
			Seats:  make([]*Column, len(seatColumns)),
			Rear:   make([][]*Column, 0),
		}
	}

	colIdx := slices.Index(componentColumns, identifier)
	col := &Column{
		Type:     "component",
		Features: []string{string(loc.Type)},
	}

	switch loc.Row.Orientation {
	case lufthansa.ComponentRowCharacteristicFront, lufthansa.ComponentRowCharacteristicMiddle:
		for len(currRow.Front) <= rowRelativeIdx {
			currRow.Front = append(currRow.Front, make([]*Column, len(componentColumns)))
		}

		currRow.Front[rowRelativeIdx][colIdx] = col

	case lufthansa.ComponentRowCharacteristicRear:
		for len(currRow.Rear) <= rowRelativeIdx {
			currRow.Rear = append(currRow.Rear, make([]*Column, len(componentColumns)))
		}

		currRow.Rear[rowRelativeIdx][colIdx] = col
	}

	return currRow, rows
}

func (s *Search) normalizeCabinClass(cc lufthansa.RequestCabinClass) string {
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

func (s *Search) generalizeCabinType(cabinType lufthansa.Code) (lufthansa.RequestCabinClass, bool) {
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
