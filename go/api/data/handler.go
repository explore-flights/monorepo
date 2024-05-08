package data

import (
	"context"
	"github.com/explore-flights/monorepo/go/common/lufthansa"
	"slices"
)

type Country struct {
	Code   string  `json:"code"`
	Name   string  `json:"name"`
	Cities []*City `json:"cities"`
}

type City struct {
	Code     string     `json:"code"`
	Name     string     `json:"name"`
	Airports []*Airport `json:"airports"`
}

type Airport struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

type Handler struct {
	r *Repo
}

func NewHandler(r *Repo) *Handler {
	return &Handler{r}
}

func (h *Handler) Locations(ctx context.Context, lang string) ([]*Country, error) {
	airports, err := h.r.Airports(ctx)
	if err != nil {
		return nil, err
	}

	airports = addMissingAirports(airports)

	citiesByCode, err := h.cities(ctx, lang)
	if err != nil {
		return nil, err
	}

	countriesByCode, err := h.countries(ctx, lang)
	if err != nil {
		return nil, err
	}

	r := make([]*Country, 0, len(countriesByCode))
	for _, airport := range airports {
		country, ok := countriesByCode[airport.CountryCode]
		if !ok {
			country = &Country{
				Code:   airport.CountryCode,
				Name:   airport.CountryCode,
				Cities: make([]*City, 0),
			}

			countriesByCode[airport.CountryCode] = country
		}

		if !slices.Contains(r, country) {
			r = append(r, country)
		}

		city, ok := citiesByCode[airport.CityCode]
		if !ok {
			city = &City{
				Code:     airport.CityCode,
				Name:     airport.CityCode,
				Airports: make([]*Airport, 0),
			}

			citiesByCode[airport.CityCode] = city
		}

		if !slices.Contains(country.Cities, city) {
			country.Cities = append(country.Cities, city)
		}

		city.Airports = append(city.Airports, &Airport{
			Code: airport.Code,
			Name: findName(airport.Names.Name, lang),
		})
	}

	return r, nil
}

func (h *Handler) countries(ctx context.Context, lang string) (map[string]*Country, error) {
	countries, err := h.r.Countries(ctx)
	if err != nil {
		return nil, err
	}

	r := make(map[string]*Country, len(countries))
	for _, v := range countries {
		r[v.CountryCode] = &Country{
			Code:   v.CountryCode,
			Name:   findName(v.Names.Name, lang),
			Cities: make([]*City, 0),
		}
	}

	return r, nil
}

func (h *Handler) cities(ctx context.Context, lang string) (map[string]*City, error) {
	cities, err := h.r.Cities(ctx)
	if err != nil {
		return nil, err
	}

	r := make(map[string]*City, len(cities))
	for _, v := range cities {
		r[v.CityCode] = &City{
			Code:     v.CityCode,
			Name:     findName(v.Names.Name, lang),
			Airports: make([]*Airport, 0),
		}
	}

	return r, nil
}

func findName(n []lufthansa.Name, lang string) string {
	if len(n) < 1 {
		return ""
	}

	r := n[0].Name
	for _, v := range n {
		if v.LanguageCode == lang {
			return v.Name
		} else if v.LanguageCode == "EN" {
			r = v.Name
		}
	}

	return r
}

func addMissingAirports(airports []lufthansa.Airport) []lufthansa.Airport {
	return append(
		airports,
		lufthansa.Airport{
			Code:        "BER",
			CityCode:    "BER",
			CountryCode: "DE",
			Names: lufthansa.Names{
				Name: lufthansa.Array[lufthansa.Name]{
					{LanguageCode: "EN", Name: "Berlin/Brandenburg"},
				},
			},
		},
	)
}
