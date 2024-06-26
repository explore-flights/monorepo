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
  SpaceBetween,
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

export default function CookiePreferences({ onDismiss, ...modalProps }: ModalProps) {
  const hasConsent = useHasConsent();
  const [consentLevels, setConsentLevels] = useConsent();
  const [consent, setConsent] = useState({
    functional: consentLevels.has(ConsentLevel.FUNCTIONALITY),
  });

  useEffect(() => {
    if (hasConsent) {
      setConsent({ functional: consentLevels.has(ConsentLevel.FUNCTIONALITY) });
    } else {
      setConsent({ functional: true });
    }
  }, [hasConsent, consentLevels]);

  function onCancelClick(e: CustomEvent<unknown>) {
    setConsent({ functional: consentLevels.has(ConsentLevel.FUNCTIONALITY) });

    if (onDismiss) {
      onDismiss(new CustomEvent(e.type, { detail: { reason: 'cancel' } }));
    }
  }

  function onDenyAllClick(e: CustomEvent<unknown>) {
    denyAll(e.type);
  }

  function denyAll(eventType: string) {
    setConsentLevels([ConsentLevel.STRICTLY_NECESSARY]);

    if (onDismiss) {
      onDismiss(new CustomEvent(eventType, { detail: { reason: 'save' } }));
    }
  }

  function onSaveClick(e: CustomEvent<unknown>) {
    if (consent.functional) {
      setConsentLevels([ConsentLevel.STRICTLY_NECESSARY, ConsentLevel.FUNCTIONALITY]);
    } else {
      setConsentLevels([ConsentLevel.STRICTLY_NECESSARY]);
    }

    if (onDismiss) {
      onDismiss(new CustomEvent(e.type, { detail: { reason: 'save' } }));
    }
  }

  return (
    <Modal
      onDismiss={(e) => {
        if (!hasConsent && e.detail.reason === 'closeButton') {
          denyAll(e.type);
        } else if (onDismiss) {
          onDismiss(e);
        }
      }}
      {...modalProps}
      header={'Cookie Preferences'}
      size={'large'}
      footer={
        <Box float={'right'}>
          <SpaceBetween direction={'horizontal'} size={'xs'}>
            {
              hasConsent
                ? <Button variant={'link'} onClick={onCancelClick}>Cancel</Button>
                : <Button variant={'link'} onClick={onDenyAllClick}>Deny optional</Button>
            }
            <Button variant={'primary'} onClick={onSaveClick}>Save</Button>
          </SpaceBetween>
        </Box>
      }
    >
      <ColumnLayout columns={1} borders={'horizontal'}>
        <Box variant={'span'}>We use cookies and local storage for the following purposes</Box>
        <Category
          name={'Essential'}
          description={'Essential cookies are necessary to provide our site and services and cannot be deactivated. They are usually set in response to your actions on the site, such as setting your privacy preferences, signing in, or filling in forms.'}
          checkbox={ { checked: true, disabled: true } }
        ></Category>
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
        ></Category>
        <Box variant={'small'}>Learn more about the cookies and local storage we use by reading our <RouterLink to={'/privacy-policy'} fontSize={'inherit'}>Privacy Policy</RouterLink></Box>
      </ColumnLayout>
    </Modal>
  );
}
