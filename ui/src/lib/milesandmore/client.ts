import { HTTPClient } from '../http';
import { DateTime } from 'luxon';

export enum FareFamily {
  ECO = 'CFFECOINST',
  PRECO = 'CFFPECOINS',
  BUSINESS = 'CFFBUSINST',
  FIRST = 'CFFFIRSINS',
}

export enum CorporateCode {
  LH = '223293',
}

export enum CompanyCode {
  LH = 'LH',
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

export interface FrequentFlyer {
  companyCode: CompanyCode;
  priorityCode: number;
}

export interface Itinerary {
  departureDateTime?: string;
  originLocationCode: string;
  destinationLocationCode: string;
}

export interface SearchPreferences {
  mode: Mode;
  showMilesPrice: boolean;
}

export interface Traveler {
  passengerTypeCode: PassengerCode;
}

export interface TripDetails {
  tripDuration: number;
  rangeOfDeparture: number;
}

export interface BestByRequest {
  commercialFareFamilies: ReadonlyArray<FareFamily>;
  corporateCodes: ReadonlyArray<CorporateCode>;
  currencyCode: CurrencyCode;
  frequentFlyer: FrequentFlyer;
  itineraries: ReadonlyArray<Itinerary>;
  searchPreferences: SearchPreferences;
  travelers: ReadonlyArray<Traveler>;
  tripDetails?: TripDetails;
}

export interface MMRequest {
  mode: Mode;
  fareFamily: FareFamily;
  travelers: ReadonlyArray<PassengerCode>;
  departureDateTime: DateTime<true>;
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
  originLocationCode: string;
  destinationLocationCode: string;
  flights: ReadonlyArray<Flight>;
}

export interface MilesConversion {
  convertedMiles: {
    base: number;
    total: number;
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
  fareInfos: ReadonlyArray<unknown>;
  prices: Prices;
}

export interface ResponseDataDictionaries {
  aircraft: Record<string, string>;
  airline: Record<string, string>;
  flight: Record<string, FlightLookup>;
}

export interface MMResponse {
  data: ReadonlyArray<ResponseDataEntry>;
  dictionaries: ResponseDataDictionaries;
}

export class MilesAndMoreClient {
  constructor(private readonly httpClient: HTTPClient) {
  }

  async getBestBy(req: MMRequest): Promise<MMResponse> {
    const request = {
      commercialFareFamilies: [req.fareFamily],
      corporateCodes: [CorporateCode.LH],
      currencyCode: CurrencyCode.EUR,
      frequentFlyer: {
        companyCode: CompanyCode.LH,
        priorityCode: 0,
      },
      itineraries: [
        {
          departureDateTime: req.departureDateTime.toISODate() + 'T00:00:00',
          originLocationCode: req.origin,
          destinationLocationCode: req.destination,
        },
      ],
      searchPreferences: {
        mode: req.mode,
        showMilesPrice: true,
      },
      travelers: req.travelers.map((v) => ({ passengerTypeCode: v })),
    } satisfies BestByRequest;

    const errs: Array<string> = [];

    for (let i = 0; i < 3; i++) {
      const resp = await this.httpClient.fetch(
        `http://127.0.0.1:8090/api/milesandmore/flights/v1/${req.mode === Mode.BEST_BY_MONTH ? 'bestbymonth' : 'bestbyday'}`,
        {
          method: 'POST',
          body: JSON.stringify(request),
          headers: {
            'X-Api-Key': 'agGBZmuTGwFXWzVDg8ckGKGBytemE1nS',
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