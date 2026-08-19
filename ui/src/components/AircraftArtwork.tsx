import { classNames } from '@/lib/format';

export type AircraftAsset =
  | 'aircraft-a350-900'
  | 'aircraft-787-dreamliner'
  | 'aircraft-a380'
  | 'aircraft-a340-300'
  | 'aircraft-a340-600'
  | 'aircraft-747-400'
  | 'aircraft-747-8';

export function AircraftArtwork({
  asset,
  className,
}: {
  asset: AircraftAsset;
  className?: string;
}) {
  return (
    <svg className={classNames('aircraft-artwork', className)} aria-hidden='true' focusable='false'>
      <use href={`/assets/${asset}.svg#${asset}-artwork`} width='100%' height='100%' />
    </svg>
  );
}
