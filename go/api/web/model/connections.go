package model

import (
	"encoding/json"
	"time"

	"github.com/explore-flights/monorepo/go/api/pb"
	pbv2 "github.com/explore-flights/monorepo/go/api/pb/v2"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/durationpb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type ConnectionsSearchRequest struct {
	APIVersion          *uint32                        `json:"apiVersion,omitempty"`
	V2                  *pbv2.ConnectionsSearchRequest `json:"-"`
	Origins             []string                       `json:"origins"`
	Destinations        []string                       `json:"destinations"`
	MinDeparture        time.Time                      `json:"minDeparture"`
	MaxDeparture        time.Time                      `json:"maxDeparture"`
	MaxFlights          uint32                         `json:"maxFlights"`
	MinLayoverMS        uint64                         `json:"minLayoverMS"`
	MaxLayoverMS        uint64                         `json:"maxLayoverMS"`
	MaxDurationMS       uint64                         `json:"maxDurationMS"`
	CountMultiLeg       bool                           `json:"countMultiLeg"`
	IncludeAirport      []string                       `json:"includeAirport,omitempty"`
	ExcludeAirport      []string                       `json:"excludeAirport,omitempty"`
	IncludeFlightNumber []string                       `json:"includeFlightNumber,omitempty"`
	ExcludeFlightNumber []string                       `json:"excludeFlightNumber,omitempty"`
	IncludeAircraft     []string                       `json:"includeAircraft,omitempty"`
	ExcludeAircraft     []string                       `json:"excludeAircraft,omitempty"`
}

func (req ConnectionsSearchRequest) ToPb() proto.Message {
	if req.V2 != nil {
		version := uint32(2)
		return &pb.ConnectionsSearchRequest{ApiVersion: &version, V2: req.V2}
	}
	countMultiLeg := req.CountMultiLeg
	return &pb.ConnectionsSearchRequest{
		ApiVersion:          req.APIVersion,
		Origins:             req.Origins,
		Destinations:        req.Destinations,
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
	Airlines    map[string]Airline                `json:"airlines"`
	Airports    map[string]Airport                `json:"airports"`
	Aircraft    map[string]Aircraft               `json:"aircraft"`
}

type ConnectionResponse struct {
	FlightId UUID                 `json:"flightId"`
	Outgoing []ConnectionResponse `json:"outgoing"`
}

type ConnectionFlightResponse struct {
	FlightNumber             FlightNumber   `json:"flightNumber"`
	DepartureTime            time.Time      `json:"departureTime"`
	DepartureAirportIataCode string         `json:"departureAirportId"`
	ArrivalTime              time.Time      `json:"arrivalTime"`
	ArrivalAirportIataCode   string         `json:"arrivalAirportId"`
	AircraftOwner            string         `json:"aircraftOwner"`
	AircraftIataCode         string         `json:"aircraftId"`
	AircraftConfiguration    string         `json:"aircraftConfiguration"`
	CodeShares               []FlightNumber `json:"codeShares"`
}

type ConnectionsSearchResponse struct {
	Data         ConnectionsResponse       `json:"data"`
	Search       *ConnectionsSearchRequest `json:"search,omitempty"`
	Continuation *ConnectionsContinuation  `json:"continuation"`
}

func (req ConnectionsSearchRequest) MarshalJSON() ([]byte, error) {
	if req.V2 != nil {
		value, err := protojson.Marshal(req.V2)
		if err != nil {
			return nil, err
		}
		return json.Marshal(struct {
			APIVersion uint32          `json:"apiVersion"`
			V2         json.RawMessage `json:"v2"`
		}{2, value})
	}
	type legacy ConnectionsSearchRequest
	return json.Marshal(legacy(req))
}
