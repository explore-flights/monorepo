import { Alert, Button, SpaceBetween } from '@cloudscape-design/components';
import React from 'react';
import { ConsentLevel } from '../../lib/consent.model';
import { useConsent } from '../util/state/use-consent';
import classes from './cookie-banner.module.scss';

export function CookieBanner({ onCustomizeClick }: { onCustomizeClick: () => void }) {
  const [, setConsentLevels] = useConsent();

  function onDenyOptionalClick() {
    setConsentLevels([ConsentLevel.STRICTLY_NECESSARY]);
  }

  function onAcceptAllClick() {
    setConsentLevels([ConsentLevel.STRICTLY_NECESSARY, ConsentLevel.FUNCTIONALITY]);
  }

  return (
    <div className={classes['flights-cookie-banner']}>
      <Alert
        type={'info'}
        header={'Select your cookie preferences'}
        action={<SpaceBetween size={'xs'} direction={'horizontal'}>
          <Button variant={'normal'} onClick={onDenyOptionalClick}>Deny Optional</Button>
          <Button variant={'normal'} onClick={onCustomizeClick}>Customize</Button>
          <Button variant={'primary'} onClick={onAcceptAllClick}>Accept All</Button>
        </SpaceBetween>}
      >We use cookies and local storage to provide basic functionality on this site, for example to allow you to stay logged in or to remember your preferences on this device.</Alert>
    </div>
  );
}
