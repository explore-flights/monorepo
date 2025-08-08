import {
  Button,
  ColumnLayout,
  Container,
  ContentLayout,
  Header,
  LineChart,
  Tiles,
  TilesProps
} from '@cloudscape-design/components';
import React, { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAircraftReport, useAirports, useDestinations } from '../components/util/state/data';
import { Aircraft, AircraftReport, Airport, AirportId, DestinationReport } from '../lib/api/api.model';
import { Duration } from 'luxon';
import { LineSeries, SeriesBuilder } from '../lib/charts/builder';
import { MaplibreMap, SmartLine } from '../components/maplibre/maplibre-map';
import { airportToString } from '../lib/util/flight';
import { Marker } from 'react-map-gl/maplibre';

export function AirportPage() {
  const { id } = useParams();
  if (!id) {
    throw new Error();
  }

  const airports = useAirports().data;
  const airport = useMemo(() => {
    return airports.lookupByIata.get(id) ?? airports.lookupByIcao.get(id) ?? airports.lookupById.get(id as AirportId);
  }, [id, airports]);

  const items = useMemo(() => {
    const items: Array<TilesProps.TilesDefinition> = [
      { label: 'All', value: 'all' },
    ];

    const maxYear = new Date().getFullYear() + 1;
    for (let year = 2024; year <= maxYear; year++) {
      items.push(
        { label: year.toString(), value: year.toString() },
        { label: `${year}/Summer`, value: `${year}-summer` },
        { label: `${year}/Winter`, value: `${year}-winter` },
      );
    }

    return items;
  }, []);

  const [selectedYearAndSchedule, setSelectedYearAndSchedule] = useState('all');
  const yearAndSchedule = useMemo(() => {
    if (!selectedYearAndSchedule || selectedYearAndSchedule === 'all') {
      return null;
    }

    const parts = selectedYearAndSchedule.split('-', 2);
    const yearPart = Number.parseInt(parts[0]);

    if (parts.length >= 2) {
      const isSummerSchedule = parts[1] === 'summer';
      return { year: yearPart, isSummerSchedule: isSummerSchedule };
    }

    return { year: yearPart, isSummerSchedule: null };
  }, [selectedYearAndSchedule]);

  const destinationsQuery = useDestinations(id, yearAndSchedule?.year, yearAndSchedule?.isSummerSchedule ?? undefined);
  const aircraftReportQuery = useAircraftReport(id, yearAndSchedule?.year, yearAndSchedule?.isSummerSchedule ?? undefined);

  return (
    <ContentLayout header={<Header variant={'h1'}>Airport {airport ? airportToString(airport) : id}</Header>}>
      <Container>
        <ColumnLayout columns={1}>
          <Tiles
            value={selectedYearAndSchedule}
            onChange={(e) => setSelectedYearAndSchedule(e.detail.value)}
            items={items}
            readOnly={destinationsQuery.isLoading || aircraftReportQuery.isLoading}
          />

          <DestinationsMap airport={airport} destinations={destinationsQuery.data} loading={destinationsQuery.isLoading} />
          <AircraftReportChart reports={aircraftReportQuery.data} loading={aircraftReportQuery.isLoading} />
        </ColumnLayout>
      </Container>
    </ContentLayout>
  );
}

function DestinationsMap({ airport, destinations, loading }: { airport?: Airport, destinations: ReadonlyArray<DestinationReport>, loading: boolean }) {
  const nodes = useMemo(() => {
    const nodes: Array<React.ReactNode> = [];
    if (!airport || !airport.location || destinations.length < 1) {
      return nodes;
    }

    const srcLocation = airport.location;
    nodes.push(
      <Marker latitude={srcLocation.lat} longitude={srcLocation.lng}>
        <Button variant={'primary'} disabled={true}>{airportToString(airport)}</Button>
      </Marker>
    );

    for (const destination of destinations) {
      const destinationAirport = destination.airport;
      if (!destinationAirport.location) {
        continue;
      }

      nodes.push(<SmartLine src={[srcLocation.lng, srcLocation.lat]} dst={[destinationAirport.location.lng, destinationAirport.location.lat]} />);
      nodes.push(
        <Marker latitude={destinationAirport.location.lat} longitude={destinationAirport.location.lng}>
          <Button variant={'normal'} disabled={true}>{airportToString(destinationAirport)}</Button>
        </Marker>
      );
    }

    return nodes;
  }, [airport, destinations]);

  return (
    <MaplibreMap height={'50vh'} initialLat={airport?.location?.lat} initialLng={airport?.location?.lng} loading={loading || (!airport)}>
      {...nodes}
    </MaplibreMap>
  );
}

function AircraftReportChart({ reports, loading }: { reports: ReadonlyArray<AircraftReport>, loading: boolean }) {
  const durationFormatter = useCallback((v: number) => {
    return Duration.fromMillis(v * 1000).shiftTo('hours', 'minutes').toHuman({ listStyle: 'narrow', unitDisplay: 'narrow', maximumFractionDigits: 0 });
  }, []);

  const [series, xDomain, yDomain] = useMemo(() => {
    const builder = new SeriesBuilder<string, LineSeries<number>, Aircraft>('line', undefined, (ac) => ac.id);

    for (const report of reports) {
      for (const [duration, flights] of report.flightsAndDuration) {
        const rem15M = duration % (60 * 15);

        builder.add(
          report.aircraft,
          duration - rem15M,
          flights,
        );
      }
    }

    return builder.series((ac) => ({
      title: ac.name ?? ac.icaoCode ?? ac.iataCode ?? ac.id,
    }), false, true);
  }, [reports]);

  return (
    <LineChart
      series={series}
      xDomain={xDomain}
      yDomain={yDomain ? [0, yDomain[1]]: undefined}
      xTitle={'Duration'}
      yTitle={'Flights'}
      xTickFormatter={durationFormatter}
      statusType={loading ? 'loading' : 'finished'}
    />
  );
}