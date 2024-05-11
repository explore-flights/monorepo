import { Box, Link } from '@cloudscape-design/components';
import React from 'react';
import { Copy } from '../common/copy';
import { KeyValuePairs, ValueWithLabel } from '../common/key-value-pairs';

const EMAIL = 'contact@explore.flights';

export function Contact() {
  return (
    <KeyValuePairs columns={1}>
      <ValueWithLabel label={'E-Mail'}>
        <Box>Send us an E-Mail at <Copy copyText={EMAIL}><Link href={`mailto:${EMAIL}`} external={true}>{EMAIL}</Link></Copy></Box>
      </ValueWithLabel>
    </KeyValuePairs>
  );
}
