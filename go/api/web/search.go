package web

import (
	"github.com/explore-flights/monorepo/go/api/data"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/labstack/echo/v4"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

func NewSearchEndpoint(dh *data.Handler) echo.HandlerFunc {
	search := func(c echo.Context) ([]common.FlightNumber, error) {
		query := strings.TrimSpace(strings.ToUpper(c.QueryParam("q")))
		fns, err := dh.FlightNumbers(c.Request().Context(), query, 100)
		if err != nil {
			return nil, err
		}

		return fns, nil
	}

	return func(c echo.Context) error {
		fns, err := search(c)

		if c.Request().Header.Get(echo.HeaderAccept) == echo.MIMEApplicationJSON {
			// api request
			if err != nil {
				return echo.NewHTTPError(http.StatusInternalServerError)
			}

			return c.JSON(http.StatusOK, fns)
		} else {
			// user request
			if err != nil {
				q := make(url.Values)
				q.Set("status", strconv.Itoa(http.StatusInternalServerError))
				q.Set("error", "Internal Server Error")
				q.Set("message", err.Error())
				q.Set("path", c.Request().URL.Path)

				return c.Redirect(http.StatusFound, "/error?"+q.Encode())
			} else if len(fns) < 1 {
				q := make(url.Values)
				q.Set("status", strconv.Itoa(http.StatusNotFound))
				q.Set("error", "Not Found")
				q.Set("message", "No flights found matching your search. Only prefix search is supported.")
				q.Set("path", c.Request().URL.Path)

				return c.Redirect(http.StatusFound, "/error?"+q.Encode())
			} else if len(fns) > 1 {
				q := make(url.Values)
				for _, fn := range fns {
					q.Add("v", fn.String())
				}

				return c.Redirect(http.StatusFound, "/flight?"+q.Encode())
			}

			return c.Redirect(http.StatusFound, "/flight/"+url.PathEscape(fns[0].String()))
		}
	}
}
