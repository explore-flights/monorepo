Connection search accepts the legacy request or an explicitly versioned v2 request,
using JSON or `application/x-protobuf`. The legacy protobuf field numbers are
unchanged. An absent `apiVersion` (or version 1) selects the legacy contract;
version 2 requires the `v2` payload and cannot be mixed with legacy fields.

For example, a v2 JSON request:

```json
{
  "apiVersion": 2,
  "v2": {
    "query": {
      "minDeparture": "2026-11-17T00:00:00Z",
      "maxDeparture": "2026-11-17T23:59:00Z",
      "expressions": {
        "departureAirportFilter": "airport.CountryCode == 'DE'",
        "connectionEvaluation": "connection.size() > 3 || !(flight.ServiceType in ['J', 'U']) ? abort() : (flight.ArrivalAirport.IataCode == 'JFK' ? yield() : proceed(LayoverWindow{Min: duration('75m'), Max: duration('6h')}))"
      }
    },
    "page": { "size": 50 }
  }
}
```

`connection` is a typed flight list. It supports list macros, `slice(start, end)`,
and the member utilities documented in `go/api/business/connections/filtercel.go`.
`flight` aliases the last flight of the nonempty candidate `connection`.
`abort()` rejects the candidate, `yield()` returns it without exploring descendants,
and `proceed(LayoverWindow{Min: duration('75m'), Max: duration('6h')})` explores
next departures inside that layover window. Omitted `Min` is zero; omitted `Max`
has no additional upper bound. Explicit zero `Max` means no layover.

Compose yielding and further exploration with addition:

```cel
yield() + proceed(LayoverWindow{Min: duration('75m'), Max: duration('6h')})
```

Addition combines the two effects in either order. `abort()` is the empty
evaluation. Adding two `proceed()` evaluations is an error; specify a single
window instead. Negative or inverted windows are rejected. The separate flight
filter has been removed; flight-level predicates belong in this evaluator.

Both versions return the existing `ConnectionsSearchResponse` shape, with an
additional `continuation` string (or `null` when exhausted). Resume by sending the
same request with `?continuation=<token>`. A page contains at most the requested
number of complete connections, including separately yielded prefixes.

Legacy requests always use a page size of 500. V2 defaults to 50 when size is
omitted or zero. Values above 500 return HTTP 400. Continuation belongs exclusively
to the query string, not the request body or shared protobuf payload.

The opaque token is base62 over 12 bytes: a big-endian 64-bit Unix millisecond
first-flight departure, followed by a big-endian 32-bit consumed count at that
same departure time. Tokens assume unchanged flight data and request filters.
The business search remains independent of this encoding.

The search loads and caches each UTC date within the request. Cached dates older
than the current root departure date are evicted as the search watermark advances.
Departure windows are constrained to the algorithm's supported date range. Its minimum supported date is 2024-03-04 and
its maximum is one year (366 days) from now. Each business search request also
has a 25-second timeout. Both minDeparture and maxDeparture are required and
bound only the first flight. Later flights use the evaluator's layover window.
The web layer rejects continuation timestamps outside the root departure window.
