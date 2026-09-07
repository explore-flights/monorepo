package web

import (
	"testing"
	"time"

	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/stretchr/testify/require"
)

func TestBuildFlightScheduleVersionsFeedSupportsAircraftFamilies(t *testing.T) {
	variantId := model.UUID{}
	aircraftIataCode := "32S"

	fs := model.FlightScheduleVersions{
		FlightNumber: model.FlightNumber{
			AirlineIataCode: "LX",
			Number:          2144,
		},
		DepartureDateLocal:       xtime.MustParseLocalDate("2026-04-16"),
		DepartureAirportIataCode: "ZRH",
		Versions: []model.FlightScheduleVersion{
			{
				Version:         time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC),
				FlightVariantId: &variantId,
			},
		},
		Variants: map[model.UUID]model.FlightScheduleVariant{
			variantId: {
				AircraftIataCode: aircraftIataCode,
			},
		},
		Aircraft: map[string]model.Aircraft{
			aircraftIataCode: {
				Id: aircraftIataCode,
				AircraftFamily: &model.AircraftFamily{
					IataCode: aircraftIataCode,
					Name:     "Airbus A320 family",
				},
			},
		},
	}

	feed := NewDataHandler(nil).buildFlightScheduleVersionsFeed(fs)
	rss, err := feed.ToRss()

	require.NoError(t, err)
	require.Contains(t, rss, "Airbus A320 family")
}
