package lufthansa

import (
	"encoding/json"
	"slices"
)

type CabinClass string
type RequestCabinClass CabinClass

const (
	CabinClassFirstClassDiscounted    = CabinClass("A")
	CabinClassCoachEconomyDiscounted1 = CabinClass("B")
	CabinClassBusinessClass           = CabinClass("C")
	CabinClassBusinessClassDiscounted = CabinClass("D")
	CabinClassShuttleService1         = CabinClass("E")
	CabinClassFirstClass              = CabinClass("F")
	CabinClassConditionalReservation  = CabinClass("G")
	CabinClassCoachEconomyDiscounted2 = CabinClass("H")
	CabinClassBusinessClassPremium    = CabinClass("J")
	CabinClassThrift                  = CabinClass("K")
	CabinClassThriftDiscounted1       = CabinClass("L")
	CabinClassCoachEconomyDiscounted3 = CabinClass("M")
	CabinClassFirstClassPremium       = CabinClass("P")
	CabinClassCoachEconomyDiscounted4 = CabinClass("Q")
	CabinClassSupersonic              = CabinClass("R")
	CabinClassStandardClass           = CabinClass("S")
	CabinClassCoachEconomyDiscounted5 = CabinClass("T")
	CabinClassShuttleService2         = CabinClass("U")
	CabinClassThriftDiscounted2       = CabinClass("V")
	CabinClassCoachEconomyPremium     = CabinClass("W")
	CabinClassCoachEconomy            = CabinClass("Y")

	RequestCabinClassFirst      = RequestCabinClass("F")
	RequestCabinClassBusiness   = RequestCabinClass("C")
	RequestCabinClassPremiumEco = RequestCabinClass("E")
	RequestCabinClassEco        = RequestCabinClass("M")
)

type SeatCharacteristic Code

func (sc *SeatCharacteristic) UnmarshalJSON(b []byte) error {
	return unmarshalStringAs[SeatCharacteristic, Code](b, sc)
}

func (sc SeatCharacteristic) MarshalJSON() ([]byte, error) {
	return json.Marshal(Code(sc))
}

const (
	SeatCharacteristicRestricted                 = SeatCharacteristic("1")
	SeatCharacteristicNotAllowedForInfant        = SeatCharacteristic("1A")
	SeatCharacteristicRestrictedRecline          = SeatCharacteristic("1D")
	SeatCharacteristicWindowWithoutWindow        = SeatCharacteristic("1W")
	SeatCharacteristicNoSeatAtLocation           = SeatCharacteristic("8")
	SeatCharacteristicCenter                     = SeatCharacteristic("9")
	SeatCharacteristicAisle                      = SeatCharacteristic("A")
	SeatCharacteristicBassinetFacility           = SeatCharacteristic("B")
	SeatCharacteristicBusinessClassBed           = SeatCharacteristic("BC")
	SeatCharacteristicExitRow                    = SeatCharacteristic("E")
	SeatCharacteristicEconomyPlus                = SeatCharacteristic("EP")
	SeatCharacteristicEconomy                    = SeatCharacteristic("ES")
	SeatCharacteristicHandicappedFacility        = SeatCharacteristic("H")
	SeatCharacteristicSuitableForAdultWithInfant = SeatCharacteristic("I")
	SeatCharacteristicNotSuitableForChild        = SeatCharacteristic("IE")
	SeatCharacteristicJump                       = SeatCharacteristic("JP")
	SeatCharacteristicBulkhead                   = SeatCharacteristic("K")
	SeatCharacteristicLegSpace                   = SeatCharacteristic("L")
	SeatCharacteristicLeftSide                   = SeatCharacteristic("LS")
	SeatCharacteristicPreferential               = SeatCharacteristic("O")
	SeatCharacteristicOverwing                   = SeatCharacteristic("OW")
	SeatCharacteristicQuietZone                  = SeatCharacteristic("Q")
	SeatCharacteristicRightSide                  = SeatCharacteristic("RS")
	SeatCharacteristicUpperDeck                  = SeatCharacteristic("UP")
	SeatCharacteristicWindow                     = SeatCharacteristic("W")
	SeatCharacteristicWindowAndAisleTogether     = SeatCharacteristic("WA")
	SeatCharacteristicBufferZone                 = SeatCharacteristic("Z")
)

type ComponentRowCharacteristic Code

func (cc *ComponentRowCharacteristic) UnmarshalJSON(b []byte) error {
	return unmarshalStringAs[ComponentRowCharacteristic, Code](b, cc)
}

func (cc ComponentRowCharacteristic) MarshalJSON() ([]byte, error) {
	return json.Marshal(Code(cc))
}

const (
	ComponentRowCharacteristicFront  = ComponentRowCharacteristic("F")
	ComponentRowCharacteristicMiddle = ComponentRowCharacteristic("M")
	ComponentRowCharacteristicRear   = ComponentRowCharacteristic("R")
)

type ComponentColumnCharacteristic Code

func (cc *ComponentColumnCharacteristic) UnmarshalJSON(b []byte) error {
	return unmarshalStringAs[ComponentColumnCharacteristic, Code](b, cc)
}

func (cc ComponentColumnCharacteristic) MarshalJSON() ([]byte, error) {
	return json.Marshal(Code(cc))
}

const (
	ComponentColumnCharacteristicCenter      = ComponentColumnCharacteristic("C")
	ComponentColumnCharacteristicLeftSide    = ComponentColumnCharacteristic("L")
	ComponentColumnCharacteristicLeftCenter  = ComponentColumnCharacteristic("LC")
	ComponentColumnCharacteristicRightSide   = ComponentColumnCharacteristic("R")
	ComponentColumnCharacteristicRightCenter = ComponentColumnCharacteristic("RC")
)

type ComponentCharacteristic Code

func (cc *ComponentCharacteristic) UnmarshalJSON(b []byte) error {
	return unmarshalStringAs[ComponentCharacteristic, Code](b, cc)
}

func (cc ComponentCharacteristic) MarshalJSON() ([]byte, error) {
	return json.Marshal(Code(cc))
}

const (
	ComponentCharacteristicAirphone          = ComponentCharacteristic("AR")
	ComponentCharacteristicBar               = ComponentCharacteristic("BA")
	ComponentCharacteristicBulkhead          = ComponentCharacteristic("BK")
	ComponentCharacteristicCloset            = ComponentCharacteristic("CL")
	ComponentCharacteristicExitDoor          = ComponentCharacteristic("D")
	ComponentCharacteristicEmergencyExit     = ComponentCharacteristic("E")
	ComponentCharacteristicGalley            = ComponentCharacteristic("G")
	ComponentCharacteristicLavatory          = ComponentCharacteristic("LA")
	ComponentCharacteristicLuggageStorage    = ComponentCharacteristic("LG")
	ComponentCharacteristicMovieScreen       = ComponentCharacteristic("MV")
	ComponentCharacteristicStorageSpace      = ComponentCharacteristic("SO")
	ComponentCharacteristicStairsToUpperDeck = ComponentCharacteristic("ST")
	ComponentCharacteristicTable             = ComponentCharacteristic("TA")
)

type SeatAvailability struct {
	Flights     json.RawMessage    `json:"Flights"`
	CabinLayout *CabinLayout       `json:"CabinLayout,omitempty"`
	SeatDisplay Array[SeatDisplay] `json:"SeatDisplay"`
	SeatDetails Array[SeatDetail]  `json:"SeatDetails"`
}

func (sa SeatAvailability) Details(start, end int) []SeatDetail {
	details := make([]SeatDetail, 0, (end-start)*10)
	for _, sd := range sa.SeatDetails {
		if int(sd.Location.Row.Number) >= start && int(sd.Location.Row.Number) <= end {
			details = append(details, sd)
		}
	}

	return details
}

type CabinLayout struct {
	WingPosition    SeatDisplayRows        `json:"WingPosition"`
	ExitRowPosition Array[SeatDisplayRows] `json:"ExitRowPosition"`
}

type SeatDisplayColumn struct {
	Position string `json:"@Position"`
}

type SeatDisplayRows struct {
	First JsonStrAsInt `json:"First"`
	Last  JsonStrAsInt `json:"Last"`
}

type SeatDisplayComponent struct {
	Locations struct {
		Location Array[SeatDisplayComponentLocation] `json:"Location"`
	} `json:"Locations"`
}

type SeatDisplayComponentLocation struct {
	Row    SeatDisplayComponentLocationRow `json:"Row"`
	Column struct {
		Position ComponentColumnCharacteristic `json:"Position"`
	} `json:"Column"`
	Type ComponentCharacteristic `json:"Type"`
}

type SeatDisplayComponentLocationRow struct {
	Position    JsonStrAsInt               `json:"Position"`
	Orientation ComponentRowCharacteristic `json:"Orientation"`
}

type SeatDisplay struct {
	Columns    Array[SeatDisplayColumn]    `json:"Columns"`
	Rows       SeatDisplayRows             `json:"Rows"`
	Components Array[SeatDisplayComponent] `json:"Component"`
	CabinType  Code                        `json:"CabinType"`
}

type SeatDetail struct {
	Location SeatDetailLocation `json:"Location"`
}

func (sd SeatDetail) HasCharacteristic(c SeatCharacteristic) bool {
	return slices.Contains(sd.Location.Row.Characteristics.Characteristic, c)
}

func (sd SeatDetail) AisleAccess() bool {
	return sd.HasCharacteristic(SeatCharacteristicAisle) || sd.HasCharacteristic(SeatCharacteristicWindowAndAisleTogether)
}

func (sd SeatDetail) Empty() bool {
	return sd.HasCharacteristic(SeatCharacteristicNoSeatAtLocation) || sd.Location.Column == "" || len(sd.Location.Row.Characteristics.Characteristic) < 1
}

type SeatDetailLocation struct {
	Column string                `json:"Column"`
	Row    SeatDetailLocationRow `json:"Row"`
}

type SeatDetailLocationRow struct {
	Number          JsonStrAsInt `json:"Number"`
	Characteristics struct {
		Characteristic Array[SeatCharacteristic] `json:"Characteristic"`
	} `json:"Characteristics"`
}

func unmarshalStringAs[T ~string, As ~string](b []byte, ptr *T) error {
	var v As
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}

	*ptr = T(v)
	return nil
}
