package model

import (
	"github.com/explore-flights/monorepo/go/api/pb"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/durationpb"
	"google.golang.org/protobuf/types/known/timestamppb"
	"time"
)

type ConnectionsSearchRequest struct {
	Origins             []UUID    `json:"origins"`
	Destinations        []UUID    `json:"destinations"`
	MinDeparture        time.Time `json:"minDeparture"`
	MaxDeparture        time.Time `json:"maxDeparture"`
	MaxFlights          uint32    `json:"maxFlights"`
	MinLayoverMS        uint64    `json:"minLayoverMS"`
	MaxLayoverMS        uint64    `json:"maxLayoverMS"`
	MaxDurationMS       uint64    `json:"maxDurationMS"`
	CountMultiLeg       bool      `json:"countMultiLeg"`
	IncludeAirport      []string  `json:"includeAirport,omitempty"`
	ExcludeAirport      []string  `json:"excludeAirport,omitempty"`
	IncludeFlightNumber []string  `json:"includeFlightNumber,omitempty"`
	ExcludeFlightNumber []string  `json:"excludeFlightNumber,omitempty"`
	IncludeAircraft     []string  `json:"includeAircraft,omitempty"`
	ExcludeAircraft     []string  `json:"excludeAircraft,omitempty"`
}

func (req ConnectionsSearchRequest) ToPb() proto.Message {
	countMultiLeg := req.CountMultiLeg
	origins := make([]string, len(req.Origins))
	destinations := make([]string, len(req.Destinations))

	for i, origin := range req.Origins {
		origins[i] = "idv1:" + origin.String()
	}

	for i, destination := range req.Destinations {
		destinations[i] = "idv1:" + destination.String()
	}

	return &pb.ConnectionsSearchRequest{
		Origins:             origins,
		Destinations:        destinations,
		MinDeparture:        timestamppb.New(req.MinDeparture),
		MaxDeparture:        timestamppb.New(req.MaxDeparture),
		MaxFlights:          req.MaxFlights,
		MinLayover:          durationpb.New(time.Duration(req.MinLayoverMS) * time.Millisecond),
		MaxLayover:          durationpb.New(time.Duration(req.MaxLayoverMS) * time.Millisecond),
		MaxDuration:         durationpb.New(time.Duration(req.MaxDurationMS) * time.Millisecond),
		CountMultiLeg:       &countMultiLeg,
		IncludeAirport:      req.IncludeAirport,
		ExcludeAirport:      req.ExcludeAirport,
		IncludeFlightNumber: req.IncludeFlightNumber,
		ExcludeFlightNumber: req.ExcludeFlightNumber,
		IncludeAircraft:     req.IncludeAircraft,
		ExcludeAircraft:     req.ExcludeAircraft,
	}
}

type ConnectionsResponse struct {
	Connections []ConnectionResponse              `json:"connections"`
	Flights     map[UUID]ConnectionFlightResponse `json:"flights"`
	Airlines    map[UUID]Airline                  `json:"airlines"`
	Airports    map[UUID]Airport                  `json:"airports"`
	Aircraft    map[UUID]Aircraft                 `json:"aircraft"`
}

type ConnectionResponse struct {
	FlightId UUID                 `json:"flightId"`
	Outgoing []ConnectionResponse `json:"outgoing"`
}

type ConnectionFlightResponse struct {
	FlightNumber          FlightNumber   `json:"flightNumber"`
	DepartureTime         time.Time      `json:"departureTime"`
	DepartureAirportId    UUID           `json:"departureAirportId"`
	ArrivalTime           time.Time      `json:"arrivalTime"`
	ArrivalAirportId      UUID           `json:"arrivalAirportId"`
	AircraftOwner         string         `json:"aircraftOwner"`
	AircraftId            UUID           `json:"aircraftId"`
	AircraftConfiguration string         `json:"aircraftConfiguration"`
	AircraftRegistration  string         `json:"aircraftRegistration,omitempty"`
	CodeShares            []FlightNumber `json:"codeShares"`
}

type ConnectionsSearchResponse struct {
	Data   ConnectionsResponse       `json:"data"`
	Search *ConnectionsSearchRequest `json:"search,omitempty"`
}
