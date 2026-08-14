package model

import (
	"cmp"
	"maps"
	"slices"
	"time"

	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/common/xtime"
)

type AirportStatisticsResponse struct {
	AirportIataCode string                       `json:"airportId"`
	YearLocal       int                          `json:"year"`
	Directions      []AirportDirectionStatistics `json:"directions"`
	Airlines        map[string]Airline           `json:"airlines"`
	Airports        map[string]Airport           `json:"airports"`
	Aircraft        map[string]Aircraft          `json:"aircraft"`
}

type AirportDirectionStatistics struct {
	Direction              db.AirportMovementDirection `json:"direction"`
	ScheduledLegs          int                         `json:"scheduledLegs"`
	RouteCount             int                         `json:"routeCount"`
	AirlineCount           int                         `json:"airlineCount"`
	AircraftTypeCount      int                         `json:"aircraftTypeCount"`
	FirstDateLocal         xtime.LocalDate             `json:"firstDateLocal"`
	LastDateLocal          xtime.LocalDate             `json:"lastDateLocal"`
	DurationSecondsTotal   int64                       `json:"durationSecondsTotal"`
	DurationSecondsAverage float64                     `json:"durationSecondsAverage"`
	DurationSecondsMedian  float64                     `json:"durationSecondsMedian"`
	DurationSecondsMinimum int64                       `json:"durationSecondsMinimum"`
	DurationSecondsMaximum int64                       `json:"durationSecondsMaximum"`
	Routes                 []AirportRouteStatistics    `json:"routes"`
	Days                   []AirportDailyStatistics    `json:"days"`
}

type AirportRouteStatistics struct {
	OtherAirportIataCode     string          `json:"otherAirportId"`
	OperatingAirlineIataCode string          `json:"operatingAirlineId"`
	AircraftIataCode         string          `json:"aircraftId"`
	ScheduledLegs            int             `json:"scheduledLegs"`
	FirstDateLocal           xtime.LocalDate `json:"firstDateLocal"`
	LastDateLocal            xtime.LocalDate `json:"lastDateLocal"`
	DurationSecondsTotal     int64           `json:"durationSecondsTotal"`
	DurationSecondsAverage   float64         `json:"durationSecondsAverage"`
	DurationSecondsMedian    float64         `json:"durationSecondsMedian"`
	DurationSecondsMinimum   int64           `json:"durationSecondsMinimum"`
	DurationSecondsMaximum   int64           `json:"durationSecondsMaximum"`
}

type AirportDailyStatistics struct {
	DateLocal              xtime.LocalDate `json:"dateLocal"`
	ScheduledLegs          int             `json:"scheduledLegs"`
	RouteCount             int             `json:"routeCount"`
	AirlineCount           int             `json:"airlineCount"`
	AircraftTypeCount      int             `json:"aircraftTypeCount"`
	DurationSecondsTotal   int64           `json:"durationSecondsTotal"`
	DurationSecondsAverage float64         `json:"durationSecondsAverage"`
	DurationSecondsMedian  float64         `json:"durationSecondsMedian"`
	DurationSecondsMinimum int64           `json:"durationSecondsMinimum"`
	DurationSecondsMaximum int64           `json:"durationSecondsMaximum"`
}

func AirportDirectionStatisticsFromDb(statistics db.AirportStatistics) AirportDirectionStatistics {
	routes := make([]AirportRouteStatistics, 0, len(statistics.RouteStatistics))
	for _, route := range statistics.RouteStatistics {
		routes = append(routes, AirportRouteStatistics{
			OtherAirportIataCode:     route.OtherAirportIataCode,
			OperatingAirlineIataCode: route.OperatingAirlineIataCode,
			AircraftIataCode:         route.AircraftIataCode,
			ScheduledLegs:            route.ScheduledLegs,
			FirstDateLocal:           route.FirstDateLocal,
			LastDateLocal:            route.LastDateLocal,
			DurationSecondsTotal:     route.DurationSecondsTotal,
			DurationSecondsAverage:   route.DurationSecondsAverage,
			DurationSecondsMedian:    route.DurationSecondsMedian,
			DurationSecondsMinimum:   route.DurationSecondsMinimum,
			DurationSecondsMaximum:   route.DurationSecondsMaximum,
		})
	}

	days := make([]AirportDailyStatistics, 0, len(statistics.DailyStatistics))
	for _, day := range statistics.DailyStatistics {
		days = append(days, AirportDailyStatistics{
			DateLocal:              day.DateLocal,
			ScheduledLegs:          day.ScheduledLegs,
			RouteCount:             day.RouteCount,
			AirlineCount:           day.AirlineCount,
			AircraftTypeCount:      day.AircraftTypeCount,
			DurationSecondsTotal:   day.DurationSecondsTotal,
			DurationSecondsAverage: day.DurationSecondsAverage,
			DurationSecondsMedian:  day.DurationSecondsMedian,
			DurationSecondsMinimum: day.DurationSecondsMinimum,
			DurationSecondsMaximum: day.DurationSecondsMaximum,
		})
	}

	return AirportDirectionStatistics{
		Direction:              statistics.Direction,
		ScheduledLegs:          statistics.ScheduledLegs,
		RouteCount:             statistics.RouteCount,
		AirlineCount:           statistics.AirlineCount,
		AircraftTypeCount:      statistics.AircraftTypeCount,
		FirstDateLocal:         statistics.FirstDateLocal,
		LastDateLocal:          statistics.LastDateLocal,
		DurationSecondsTotal:   statistics.DurationSecondsTotal,
		DurationSecondsAverage: statistics.DurationSecondsAverage,
		DurationSecondsMedian:  statistics.DurationSecondsMedian,
		DurationSecondsMinimum: statistics.DurationSecondsMinimum,
		DurationSecondsMaximum: statistics.DurationSecondsMaximum,
		Routes:                 routes,
		Days:                   days,
	}
}

type AirportTimetableResponse struct {
	AirportIataCode string                      `json:"airportId"`
	DateLocal       xtime.LocalDate             `json:"dateLocal"`
	Direction       db.AirportMovementDirection `json:"direction"`
	Movements       []AirportMovement           `json:"movements"`
	Airlines        map[string]Airline          `json:"airlines"`
	Airports        map[string]Airport          `json:"airports"`
	Aircraft        map[string]Aircraft         `json:"aircraft"`
}

type AirportMovement struct {
	FlightNumber                 FlightNumber     `json:"flightNumber"`
	DepartureTime                time.Time        `json:"departureTime"`
	DepartureAirportIataCode     string           `json:"departureAirportId"`
	ArrivalTime                  time.Time        `json:"arrivalTime"`
	ArrivalAirportIataCode       string           `json:"arrivalAirportId"`
	DurationSeconds              int64            `json:"durationSeconds"`
	ServiceType                  string           `json:"serviceType"`
	AircraftOwner                string           `json:"aircraftOwner"`
	AircraftIataCode             string           `json:"aircraftId"`
	AircraftConfigurationVersion string           `json:"aircraftConfigurationVersion"`
	CodeShares                   []FlightNumber   `json:"codeShares"`
	DataElements                 map[int64]string `json:"dataElements"`
}

func AirportMovementFromDb(flight db.Flight) AirportMovement {
	codeShares := make([]FlightNumber, 0, len(flight.CodeShares))
	for codeShare := range flight.CodeShares {
		codeShares = append(codeShares, FlightNumberFromDb(codeShare))
	}
	slices.SortFunc(codeShares, func(a, b FlightNumber) int {
		if result := cmp.Compare(a.AirlineIataCode, b.AirlineIataCode); result != 0 {
			return result
		}
		if result := cmp.Compare(a.Number, b.Number); result != 0 {
			return result
		}

		return cmp.Compare(a.Suffix, b.Suffix)
	})

	return AirportMovement{
		FlightNumber:                 FlightNumberFromDb(flight.FlightNumber),
		DepartureTime:                flight.DepartureTime,
		DepartureAirportIataCode:     flight.DepartureAirportIataCode,
		ArrivalTime:                  flight.ArrivalTime,
		ArrivalAirportIataCode:       flight.ArrivalAirportIataCode,
		DurationSeconds:              int64(flight.ArrivalTime.Sub(flight.DepartureTime) / time.Second),
		ServiceType:                  flight.ServiceType,
		AircraftOwner:                flight.AircraftOwner,
		AircraftIataCode:             flight.AircraftIataCode,
		AircraftConfigurationVersion: flight.AircraftConfigurationVersion,
		CodeShares:                   codeShares,
		DataElements:                 maps.Clone(flight.DataElements),
	}
}
