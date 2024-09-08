package lufthansa

import (
	"fmt"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"
)

type FlightSchedulesOption interface {
	Apply(q url.Values)
}

type WithAirlines []common.AirlineIdentifier

func (opt WithAirlines) Apply(q url.Values) {
	for _, v := range opt {
		q.Add("airlines", string(v))
	}
}

type WithFlightNumber int

func (opt WithFlightNumber) Apply(q url.Values) {
	q.Add("flightNumberRanges", strconv.Itoa(int(opt)))
}

type WithFlightNumberRange [2]int

func (opt WithFlightNumberRange) Apply(q url.Values) {
	q.Add("flightNumberRanges", fmt.Sprintf("%d-%d", opt[0], opt[1]))
}

type WithStartDate xtime.LocalDate

func (opt WithStartDate) Apply(q url.Values) {
	q.Set("startDate", strings.ToUpper(xtime.LocalDate(opt).Time(nil).Format("02Jan06")))
}

type WithEndDate xtime.LocalDate

func (opt WithEndDate) Apply(q url.Values) {
	q.Set("endDate", strings.ToUpper(xtime.LocalDate(opt).Time(nil).Format("02Jan06")))
}

type WithDaysOfOperation []time.Weekday

func (opt WithDaysOfOperation) Apply(q url.Values) {
	daysOfOperation := make([]rune, 7)
	for i, v := range [7]time.Weekday{time.Monday, time.Tuesday, time.Wednesday, time.Thursday, time.Friday, time.Saturday, time.Sunday} {
		if slices.Contains(opt, v) {
			daysOfOperation[i] = rune(i + 49)
		} else {
			daysOfOperation[i] = ' '
		}
	}

	q.Set("daysOfOperation", string(daysOfOperation))
}

type WithOrigin string

func (opt WithOrigin) Apply(q url.Values) {
	q.Set("origin", string(opt))
}

type WithDestination string

func (opt WithDestination) Apply(q url.Values) {
	q.Set("destination", string(opt))
}

type WithAircraftTypes []string

func (opt WithAircraftTypes) Apply(q url.Values) {
	for _, v := range opt {
		q.Add("aircraftTypes", v)
	}
}
