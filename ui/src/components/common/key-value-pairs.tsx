import { Box, ColumnLayout } from '@cloudscape-design/components';
import React from 'react';

export interface KeyValuePairsProps {
  columns: number;
}

export function KeyValuePairs({ columns, children }: React.PropsWithChildren<KeyValuePairsProps>) {
  return (
    <ColumnLayout columns={columns} variant={'text-grid'}>
      {children}
    </ColumnLayout>
  );
}

export function ValueWithLabel({ label, children }: React.PropsWithChildren<{ label: string }>) {
  return (
    <div>
      <Box variant={'awsui-key-label'}>{label}</Box>
      <div>{children}</div>
    </div>
  );
}
