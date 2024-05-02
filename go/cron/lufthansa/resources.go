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

type countryResource struct {
	Inner struct {
		Countries struct {
			Country Array[Country] `json:"Country"`
		} `json:"Countries"`
		Meta pagedResourceMeta `json:"Meta"`
	} `json:"CountryResource"`
}

func (r countryResource) Data() []Country {
	return r.Inner.Countries.Country
}

func (r countryResource) Meta() pagedResourceMeta {
	return r.Inner.Meta
}

type cityResource struct {
	Inner struct {
		Cities struct {
			City Array[City] `json:"City"`
		} `json:"Cities"`
		Meta pagedResourceMeta `json:"Meta"`
	} `json:"CityResource"`
}

func (r cityResource) Data() []City {
	return r.Inner.Cities.City
}

func (r cityResource) Meta() pagedResourceMeta {
	return r.Inner.Meta
}

type airportResource struct {
	Inner struct {
		Airports struct {
			Airport Array[Airport] `json:"Airport"`
		} `json:"Airports"`
		Meta pagedResourceMeta `json:"Meta"`
	} `json:"AirportResource"`
}

func (r airportResource) Data() []Airport {
	return r.Inner.Airports.Airport
}

func (r airportResource) Meta() pagedResourceMeta {
	return r.Inner.Meta
}

type airlineResource struct {
	Inner struct {
		Airlines struct {
			Airline Array[Airline] `json:"Airline"`
		} `json:"Airlines"`
		Meta pagedResourceMeta `json:"Meta"`
	} `json:"AirlineResource"`
}

func (r airlineResource) Data() []Airline {
	return r.Inner.Airlines.Airline
}

func (r airlineResource) Meta() pagedResourceMeta {
	return r.Inner.Meta
}

type aircraftResource struct {
	Inner struct {
		AircraftSummaries struct {
			AircraftSummary Array[Aircraft] `json:"AircraftSummary"`
		} `json:"AircraftSummaries"`
		Meta pagedResourceMeta `json:"Meta"`
	} `json:"AircraftResource"`
}

func (r aircraftResource) Data() []Aircraft {
	return r.Inner.AircraftSummaries.AircraftSummary
}

func (r aircraftResource) Meta() pagedResourceMeta {
	return r.Inner.Meta
}
