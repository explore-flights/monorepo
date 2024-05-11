import { Box, Link } from '@cloudscape-design/components';
import React from 'react';
import { Copy } from '../common/copy';
import { KeyValuePairs, ValueWithLabel } from '../common/key-value-pairs';

export function Contact() {
  return (
    <KeyValuePairs columns={1}>
      <ValueWithLabel label={'E-Mail'}>
        <Box>Send us an E-Mail at <Copy copyText={'contact@gw2auth.com'}><Link href={'mailto:contact@gw2auth.com'} external={true}>contact@gw2auth.com</Link></Copy></Box>
      </ValueWithLabel>
    </KeyValuePairs>
  );
}
