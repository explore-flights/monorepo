package lufthansa

type pagedResourceMetaLink struct {
	Href string `json:"@Href"`
	Rel  string `json:"@Rel"`
}

type pagedResourceMeta struct {
	Version    string                  `json:"@Version"`
	Link       []pagedResourceMetaLink `json:"Link"`
	TotalCount int                     `json:"TotalCount"`
}

type pagedResource[D any] interface {
	Data() []D
	Meta() pagedResourceMeta
}

type countryResource[D any] struct {
	Inner struct {
		Countries struct {
			Country Array[D] `json:"Country"`
		} `json:"Countries"`
		Meta pagedResourceMeta `json:"Meta"`
	} `json:"CountryResource"`
}

func (r countryResource[D]) Data() []D {
	return r.Inner.Countries.Country
}

func (r countryResource[D]) Meta() pagedResourceMeta {
	return r.Inner.Meta
}

type cityResource[D any] struct {
	Inner struct {
		Cities struct {
			City Array[D] `json:"City"`
		} `json:"Cities"`
		Meta pagedResourceMeta `json:"Meta"`
	} `json:"CityResource"`
}

func (r cityResource[D]) Data() []D {
	return r.Inner.Cities.City
}

func (r cityResource[D]) Meta() pagedResourceMeta {
	return r.Inner.Meta
}

type airportResource[D any] struct {
	Inner struct {
		Airports struct {
			Airport Array[D] `json:"Airport"`
		} `json:"Airports"`
		Meta pagedResourceMeta `json:"Meta"`
	} `json:"AirportResource"`
}

func (r airportResource[D]) Data() []D {
	return r.Inner.Airports.Airport
}

func (r airportResource[D]) Meta() pagedResourceMeta {
	return r.Inner.Meta
}

type airlineResource[D any] struct {
	Inner struct {
		Airlines struct {
			Airline Array[D] `json:"Airline"`
		} `json:"Airlines"`
		Meta pagedResourceMeta `json:"Meta"`
	} `json:"AirlineResource"`
}

func (r airlineResource[D]) Data() []D {
	return r.Inner.Airlines.Airline
}

func (r airlineResource[D]) Meta() pagedResourceMeta {
	return r.Inner.Meta
}

type aircraftResource[D any] struct {
	Inner struct {
		AircraftSummaries struct {
			AircraftSummary Array[D] `json:"AircraftSummary"`
		} `json:"AircraftSummaries"`
		Meta pagedResourceMeta `json:"Meta"`
	} `json:"AircraftResource"`
}

func (r aircraftResource[D]) Data() []D {
	return r.Inner.AircraftSummaries.AircraftSummary
}

func (r aircraftResource[D]) Meta() pagedResourceMeta {
	return r.Inner.Meta
}
