import React, { memo, useMemo } from 'react';
import { Airport, AirportId } from '../../lib/api/api.model';
import { Box, Button, Modal, TokenGroup, TokenGroupProps } from '@cloudscape-design/components';
import { MaplibreMap } from '../maplibre/maplibre-map';
import { AirportMarker } from '../maplibre/marker';
import { useAirports } from '../util/state/data';

export interface AirportSelectMapModalProps extends AirportSelectMapProps {
  header?: React.ReactNode;
  visible: boolean;
  onDismiss: () => void;
}

export function AirportSelectMapModal({ header, visible, onDismiss, ...mapProps }: AirportSelectMapModalProps) {
  return (
    <Modal
      header={header}
      size={'max'}
      disableContentPaddings={true}
      visible={visible}
      onDismiss={onDismiss}
      footer={<Box float={'right'}><Button variant={'primary'} onClick={onDismiss}>Confirm</Button></Box>}
    >
      <AirportSelectMap {...mapProps} />
    </Modal>
  );
}

interface AirportSelectMapProps {
  height?: string;
  selectedAirportIds: ReadonlyArray<AirportId>;
  onAirportClick: (airportId: AirportId) => void;
}

function AirportSelectMap({ height, selectedAirportIds, onAirportClick }: AirportSelectMapProps) {
  const { data: { airports, lookupById }, isPending: loading } = useAirports();
  const [tokenGroupItems, airportIdsByTokenGroupIndex] = useMemo(() => {
    const items: Array<TokenGroupProps.Item> = [];
    const airportIds: Array<AirportId> = [];

    for (const airportId of selectedAirportIds) {
      const airport = lookupById.get(airportId);
      if (airport) {
        items.push({ label: airport.iataCode });
        airportIds.push(airportId);
      }
    }

    return [items, airportIds];
  }, [selectedAirportIds, lookupById]);

  return (
    <MaplibreMap
      height={height ?? '85vh'}
      displayControls={{ fullscreen: false, scale: true, globeTransition: true }}
      controls={[
        <TokenGroup
          disableOuterPadding={true}
          items={tokenGroupItems}
          onDismiss={({ detail: { itemIndex }}) => onAirportClick(airportIdsByTokenGroupIndex[itemIndex])}
        />
      ]}
      loading={loading}
    >
      {airports.map((airport) => (
        <AirportSelectMarkerButton
          key={airport.id}
          airport={airport}
          selected={selectedAirportIds.includes(airport.id)}
          onClick={onAirportClick}
        />
      ))}
    </MaplibreMap>
  );
}

const AirportSelectMarkerButton = memo(function AirportSelectMarkerButton({ airport, selected, onClick }: { airport: Airport, selected: boolean, onClick: (airportId: AirportId) => void }) {
  return (
    <AirportMarker airport={airport}>
      <Button
        variant={selected ? 'primary' : 'normal'}
        iconName={selected ? 'remove' : 'add-plus'}
        onClick={() => onClick(airport.id)}
      >{airport.iataCode}</Button>
    </AirportMarker>
  );
});
