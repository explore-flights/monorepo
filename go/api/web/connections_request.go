package web

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"mime"
	"time"

	"github.com/explore-flights/monorepo/go/api/pb"
	pbv2 "github.com/explore-flights/monorepo/go/api/pb/v2"
	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/labstack/echo/v5"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/durationpb"
)

const maxConnectionRequestBytes = 1 << 20

func (ch *ConnectionsHandler) parseRequest(c *echo.Context) (model.ConnectionsSearchRequest, error) {
	if payload := c.Param("payload"); payload != "" {
		if len(payload) > maxConnectionRequestBytes*2 {
			return model.ConnectionsSearchRequest{}, errors.New("share payload is too large")
		}
		data, err := base64.RawURLEncoding.DecodeString(payload)
		if err != nil {
			return model.ConnectionsSearchRequest{}, err
		}
		return decodeConnectionsProtobuf(data)
	}
	data, err := io.ReadAll(io.LimitReader(c.Request().Body, maxConnectionRequestBytes+1))
	if err != nil {
		return model.ConnectionsSearchRequest{}, err
	}
	if len(data) > maxConnectionRequestBytes {
		return model.ConnectionsSearchRequest{}, errors.New("connection request is too large")
	}
	media, _, _ := mime.ParseMediaType(c.Request().Header.Get(echo.HeaderContentType))
	if media == "application/x-protobuf" || media == "application/protobuf" {
		return decodeConnectionsProtobuf(data)
	}
	return decodeConnectionsJSON(data)
}
func decodeConnectionsJSON(data []byte) (model.ConnectionsSearchRequest, error) {
	var req model.ConnectionsSearchRequest
	fields := make(map[string]json.RawMessage)
	decoder := json.NewDecoder(bytes.NewReader(data))
	token, err := decoder.Token()
	if err != nil || token != json.Delim('{') {
		return req, errors.New("request must be a JSON object")
	}
	for decoder.More() {
		token, err = decoder.Token()
		if err != nil {
			return req, err
		}
		name, ok := token.(string)
		if !ok {
			return req, errors.New("invalid JSON field")
		}
		if _, ok := fields[name]; ok {
			return req, fmt.Errorf("duplicate request field %q", name)
		}
		var value json.RawMessage
		if err = decoder.Decode(&value); err != nil {
			return req, err
		}
		fields[name] = value
	}
	if _, err = decoder.Token(); err != nil {
		return req, err
	}
	var trailing json.RawMessage
	if err = decoder.Decode(&trailing); err != io.EOF {
		return req, errors.New("unexpected trailing JSON")
	}
	if err = json.Unmarshal(data, &req); err != nil {
		return req, err
	}
	if value, ok := fields["apiVersion"]; ok && bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
		return req, errors.New("apiVersion must not be null")
	}
	value, hasV2 := fields["v2"]
	hasLegacy := false
	for _, key := range []string{"origins", "destinations", "minDeparture", "maxDeparture", "maxFlights", "minLayoverMS", "maxLayoverMS", "maxDurationMS", "countMultiLeg", "includeAirport", "excludeAirport", "includeFlightNumber", "excludeFlightNumber", "includeAircraft", "excludeAircraft"} {
		if _, ok := fields[key]; ok {
			hasLegacy = true
		}
	}
	if err = validateConnectionVersion(req.APIVersion, hasV2, hasLegacy); err != nil {
		return req, err
	}
	if req.APIVersion != nil && *req.APIVersion == 2 {
		for key := range fields {
			if key != "apiVersion" && key != "v2" {
				return req, fmt.Errorf("unexpected v2 envelope field %q", key)
			}
		}
	}
	if hasV2 {
		if bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return req, errors.New("v2 request is required")
		}
		req.V2 = &pbv2.ConnectionsSearchRequest{}
		if err = protojson.Unmarshal(value, req.V2); err != nil {
			return req, err
		}
	}
	return req, nil
}
func validateConnectionVersion(version *uint32, hasV2, hasLegacy bool) error {
	if version == nil || *version == 1 {
		if hasV2 {
			return errors.New("v2 payload requires apiVersion 2")
		}
		return nil
	}
	if *version != 2 {
		return fmt.Errorf("unsupported apiVersion %d", *version)
	}
	if !hasV2 {
		return errors.New("apiVersion 2 requires a v2 payload")
	}
	if hasLegacy {
		return errors.New("cannot mix legacy and v2 request fields")
	}
	return nil
}
func decodeConnectionsProtobuf(data []byte) (model.ConnectionsSearchRequest, error) {
	var req model.ConnectionsSearchRequest
	if len(data) > maxConnectionRequestBytes {
		return req, errors.New("connection request is too large")
	}
	hasLegacy, hasV2, hasVersion := false, false, false
	for raw := data; len(raw) > 0; {
		number, kind, n := protowire.ConsumeTag(raw)
		if n < 0 {
			return req, protowire.ParseError(n)
		}
		raw = raw[n:]
		if number >= 1 && number <= 15 {
			hasLegacy = true
		}
		if number == 100 {
			if hasVersion || kind != protowire.VarintType {
				return req, errors.New("invalid or duplicate apiVersion")
			}
			hasVersion = true
			version, n := protowire.ConsumeVarint(raw)
			if n < 0 || version > math.MaxUint32 {
				return req, errors.New("invalid apiVersion")
			}
		}
		if number == 101 {
			if hasV2 || kind != protowire.BytesType {
				return req, errors.New("invalid or duplicate v2 payload")
			}
			hasV2 = true
		}
		n = protowire.ConsumeFieldValue(number, kind, raw)
		if n < 0 {
			return req, protowire.ParseError(n)
		}
		raw = raw[n:]
	}
	var value pb.ConnectionsSearchRequest
	if err := proto.Unmarshal(data, &value); err != nil {
		return req, err
	}
	if err := validateConnectionVersion(value.ApiVersion, hasV2, hasLegacy); err != nil {
		return req, err
	}
	req.APIVersion = value.ApiVersion
	if value.V2 != nil {
		req.V2 = value.V2
		return req, nil
	}
	if value.MinDeparture == nil || value.MaxDeparture == nil {
		return req, errors.New("departure timestamps are required")
	}
	if err := value.MinDeparture.CheckValid(); err != nil {
		return req, err
	}
	if err := value.MaxDeparture.CheckValid(); err != nil {
		return req, err
	}
	milliseconds := func(d *durationpb.Duration) (uint64, error) {
		if d == nil {
			return 0, nil
		}
		if err := d.CheckValid(); err != nil {
			return 0, err
		}
		if d.Seconds < 0 || d.Nanos < 0 || d.Seconds > 14*24*60*60 {
			return 0, errors.New("duration must be between zero and 14 days")
		}
		return uint64(d.AsDuration() / time.Millisecond), nil
	}
	var err error
	if req.MinLayoverMS, err = milliseconds(value.MinLayover); err != nil {
		return req, err
	}
	if req.MaxLayoverMS, err = milliseconds(value.MaxLayover); err != nil {
		return req, err
	}
	if req.MaxDurationMS, err = milliseconds(value.MaxDuration); err != nil {
		return req, err
	}
	req.Origins = value.Origins
	req.Destinations = value.Destinations
	req.MinDeparture = value.MinDeparture.AsTime()
	req.MaxDeparture = value.MaxDeparture.AsTime()
	req.MaxFlights = value.MaxFlights
	req.CountMultiLeg = true
	if value.CountMultiLeg != nil {
		req.CountMultiLeg = *value.CountMultiLeg
	}
	req.IncludeAirport = value.IncludeAirport
	req.ExcludeAirport = value.ExcludeAirport
	req.IncludeFlightNumber = value.IncludeFlightNumber
	req.ExcludeFlightNumber = value.ExcludeFlightNumber
	req.IncludeAircraft = value.IncludeAircraft
	req.ExcludeAircraft = value.ExcludeAircraft
	return req, nil
}
