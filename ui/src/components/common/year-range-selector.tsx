import { Box, Button, SpaceBetween } from '@cloudscape-design/components';
import React from 'react';
import { YearRange } from '../util/state/data';

export function YearRangeSelector({ value, onChange }: { value: YearRange, onChange: (value: YearRange) => void }) {
  const [startYear, endYear] = value;
  const label = `${startYear} - ${endYear}`;

  return (
    <SpaceBetween size={'xs'} direction={'horizontal'} alignItems={'center'}>
      <Button variant={'inline-icon'} iconName={'caret-left-filled'} onClick={() => onChange([startYear - 1, endYear])} />
      <Box variant={'span'}>{label}</Box>
      <Button variant={'inline-icon'} iconName={'caret-right-filled'} onClick={() => onChange([startYear, endYear + 1])} />
    </SpaceBetween>
  );
}
