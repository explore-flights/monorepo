import { HTTPClient } from '../http';
import { DateTime } from 'luxon';

export enum FareFamily {
  ECO = 'CFFECOINST',
  PRECO = 'CFFPECOINS',
  BUSINESS = 'CFFBUSINST',
  FIRST = 'CFFFIRSINS',
}

export enum CorporateCode {
  LH = 223293,
}

export enum PassengerCode {
  ADULT = 'ADT',
}

export enum CurrencyCode {
  EUR = 'EUR',
}

export enum Mode {
  BEST_BY_MONTH = 'bestByMonth',
  BEST_BY_DAY = 'bestByDay',
}

export interface Itinerary {
  departureDateTime: string;
  originLocationCode: string;
  destinationLocationCode: string;
}

export interface TripDetails {
  tripDuration?: number;
  rangeOfDeparture: number;
}

export interface BestByRequest {
  commercialFareFamilies: ReadonlyArray<FareFamily>;
  corporateCodes: ReadonlyArray<CorporateCode>;
  countryOfCommencement: 'DE',
  currencyCode: CurrencyCode;
  itineraries: ReadonlyArray<Itinerary>;
  tripDetails: TripDetails;
}

export interface MMRequest {
  mode: Mode;
  fareFamily: FareFamily;
  travelers: ReadonlyArray<PassengerCode>;
  minDepartureDateTime: DateTime<true>;
  maxDepartureDateTime: DateTime<true>;
  origin: string;
  destination: string;
}

export interface ArrivalDeparture {
  dateTime: string;
  locationCode: string;
}

export interface FlightLookup {
  aircraftCode: string;
  arrival: ArrivalDeparture;
  departure: ArrivalDeparture;
  marketingAirlineCode: string;
  marketingFlightNumber: string;
  operatingAirlineCode: string;
}

export interface Flight {
  id: string;
  cabin: string;
  bookingClass: string;
}

export interface Bound {
  fareFamilyCode: string;
  flights: ReadonlyArray<{}>;
}

export interface MilesConversion {
  convertedMiles: {
    base: number;
  };
}

export interface TotalPrice {
  currencyCode: string;
  totalTaxes: number;
}

export interface Prices {
  milesConversion: MilesConversion;
  totalPrices: ReadonlyArray<TotalPrice>;
}

export interface ResponseDataEntry {
  departureDate: string;
  fareFamilyCode: string;
  bounds: ReadonlyArray<Bound>;
  fareInfos: ReadonlyArray<{}>;
  prices: Prices;
}

export interface Currency {
  name: string;
  decimalPlaces: number;
}

export interface ResponseDataDictionaries {
  aircraft: Record<string, string>;
  airline: Record<string, string>;
  currency: Record<string, Currency>;
  flight: Record<string, FlightLookup>;
}

export interface MMResponse {
  data: ReadonlyArray<ResponseDataEntry>;
  dictionaries: ResponseDataDictionaries;
}

export class MilesAndMoreClient {
  constructor(private readonly httpClient: HTTPClient) {
  }

  async ping(): Promise<boolean> {
    try {
      const resp = await this.httpClient.fetch('http://127.0.0.1:8090/ping');
      return resp.status === 200 && (await resp.text() === 'github.com/explore-flights/monorepo/go/proxy');
    } catch (e) {
      return false;
    }
  }

  async getBestBy(req: MMRequest): Promise<MMResponse> {
    const today = DateTime.now();
    let minDepartureDateTime = req.minDepartureDateTime;
    if (today > minDepartureDateTime) {
      minDepartureDateTime = today;
    }

    const request = {
      commercialFareFamilies: [req.fareFamily],
      corporateCodes: [CorporateCode.LH],
      countryOfCommencement: 'DE',
      currencyCode: CurrencyCode.EUR,
      itineraries: [
        {
          departureDateTime: minDepartureDateTime.toISODate() + 'T00:00:00',
          originLocationCode: req.origin,
          destinationLocationCode: req.destination,
        },
      ],
      tripDetails: {
        rangeOfDeparture: Math.ceil(minDepartureDateTime.until(req.maxDepartureDateTime).length('days')),
      },
    } satisfies BestByRequest;

    const errs: Array<string> = [];

    const maxAttempts = 1;
    for (let i = 0; i < maxAttempts; i++) {
      const resp = await this.httpClient.fetch(
        `http://127.0.0.1:8090/milesandmore/flights/v3/${req.mode === Mode.BEST_BY_MONTH ? 'bestbymonth' : 'bestbyday'}`,
        {
          method: 'POST',
          body: JSON.stringify(request),
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'X-Api-Key': 'agGBZmuTGwFXWzVDg8ckGKGBytemE1nS',
            'Rtw': 'true',
          },
        },
      );

      if (resp.status === 200) {
        return (await resp.json()) as MMResponse
      } else if (resp.status === 400) {
        return {
          data: [],
          dictionaries: {
            aircraft: {},
            airline: {},
            currency: {},
            flight: {},
          },
        };
      } else {
        errs.push(`got status ${resp.status} (${resp.statusText}): ${await resp.text()}`);
      }
    }

    throw new Error(errs.join('\n'));
  }
}