import {
  Box,
  Button,
  Checkbox,
  CheckboxProps,
  ColumnLayout,
  Grid,
  Header,
  Modal,
  ModalProps,
  SpaceBetween
} from '@cloudscape-design/components';
import React, { useEffect, useState } from 'react';
import { ConsentLevel } from '../../lib/consent.model';
import { useConsent, useHasConsent } from '../util/state/use-consent';
import { RouterLink } from '../common/router-link';

interface CategoryProps {
  name: string;
  description: string;
  checkbox: CheckboxProps;
}

function Category({ name, description, checkbox }: CategoryProps) {
  return (
    <>
      <Header variant={'h3'}>{name}</Header>
      <Grid
        gridDefinition={[
          { colspan: { default: 12, xxs: 10 } },
          { colspan: { default: 12, xxs: 2 } },
        ]}
      >
        <Box variant={'span'}>{description}</Box>
        <Checkbox {...checkbox}>Allowed</Checkbox>
      </Grid>
    </>
  );
}

export default function PrivacyPreferences({ onDismiss, ...modalProps }: ModalProps) {
  const hasConsent = useHasConsent();
  const [consentLevels, setConsentLevels] = useConsent();
  const [consent, setConsent] = useState({
    functional: consentLevels.has(ConsentLevel.FUNCTIONALITY),
    versatiles: consentLevels.has(ConsentLevel.VERSATILES),
  });

  useEffect(() => {
    if (hasConsent) {
      setConsent({
        functional: consentLevels.has(ConsentLevel.FUNCTIONALITY),
        versatiles: consentLevels.has(ConsentLevel.VERSATILES),
      });
    } else {
      setConsent({
        functional: true,
        versatiles: false,
      });
    }
  }, [hasConsent, consentLevels]);

  function onCancelClick(e: CustomEvent<unknown>) {
    setConsent({
      functional: consentLevels.has(ConsentLevel.FUNCTIONALITY),
      versatiles: consentLevels.has(ConsentLevel.VERSATILES),
    });

    if (onDismiss) {
      onDismiss(new CustomEvent(e.type, { detail: { reason: 'cancel' } }));
    }
  }

  function onSaveClick(e: CustomEvent<unknown>) {
    const result: Array<ConsentLevel> = [ConsentLevel.STRICTLY_NECESSARY];
    if (consent.functional) {
      result.push(ConsentLevel.FUNCTIONALITY);
    }

    if (consent.versatiles) {
      result.push(ConsentLevel.VERSATILES);
    }

    setConsentLevels(result);

    if (onDismiss) {
      onDismiss(new CustomEvent(e.type, { detail: { reason: 'save' } }));
    }
  }

  function onFollowPrivacyPolicy(e: CustomEvent<unknown>) {
    if (onDismiss) {
      onDismiss(new CustomEvent(e.type, { detail: { reason: 'cancel' } }));
    }
  }

  return (
    <Modal
      onDismiss={(e) => {
        if (onDismiss) {
          onDismiss(e);
        }
      }}
      {...modalProps}
      header={'Privacy Preferences'}
      size={'large'}
      footer={
        <Box float={'right'}>
          <SpaceBetween direction={'horizontal'} size={'xs'}>
            <Button variant={'link'} onClick={onCancelClick}>Cancel</Button>
            <Button variant={'primary'} onClick={onSaveClick}>Save</Button>
          </SpaceBetween>
        </Box>
      }
    >
      <ColumnLayout columns={1} borders={'horizontal'}>
        <Box variant={'span'}>We use cookies, local storage and third-party APIs for the following purposes</Box>
        <Category
          name={'Essential'}
          description={'Essential cookies are necessary to provide our site and services and cannot be deactivated. They are usually set in response to your actions on the site, such as setting your privacy preferences, signing in, or filling in forms.'}
          checkbox={ { checked: true, disabled: true } }
        />
        <Category
          name={'Functional'}
          description={'Functional cookies help us provide useful site features and remember your preferences. If you do not allow these cookies, then some or all of these services may not function properly.'}
          checkbox={
            {
              checked: consent.functional,
              disabled: false,
              onChange: (event) => setConsent((prev) => ({ ...prev, functional: event.detail.checked })),
            }
          }
        />
        <Category
          name={'VersaTiles'}
          description={'VersaTiles provides our site with the necessary data for the map component found on this site. When using the map component, your browser will automatically transfer connection metadata like your IP-Address and User-Agent to VersaTiles.'}
          checkbox={
            {
              checked: consent.versatiles,
              disabled: false,
              onChange: (event) => setConsent((prev) => ({ ...prev, versatiles: event.detail.checked })),
            }
          }
        />
        <Box variant={'small'}>Learn more about the cookies, local storage and third-party APIs we use by reading our <RouterLink to={'/privacy-policy'} fontSize={'inherit'} onFollow={onFollowPrivacyPolicy}>Privacy Policy</RouterLink></Box>
      </ColumnLayout>
    </Modal>
  );
}
