import {
  Alert,
  Box,
  Button,
  ColumnLayout,
  Header,
  Modal,
  ModalProps,
  SpaceBetween,
  Tiles,
} from '@cloudscape-design/components';
import React, { useEffect, useState } from 'react';
import { ConsentLevel } from '../../lib/consent.model';
import {
  ColorScheme, Preferences, UIDensity,
} from '../../lib/preferences.model';
import { useConsent } from '../util/state/use-consent';
import { usePreferences } from '../util/state/use-preferences';

export function PreferencesModal(props: ModalProps) {
  const [consentLevels] = useConsent();
  const [preferences, setPreferences] = usePreferences();
  const [tempPreferences, setTempPreferences] = useState<Preferences>(preferences);

  useEffect(() => {
    setTempPreferences(preferences);
  }, [preferences]);

  const { onDismiss } = props;
  function onCancelClick(e: CustomEvent) {
    setTempPreferences(preferences);

    if (onDismiss) {
      onDismiss(new CustomEvent(e.type, { detail: { reason: 'cancel' } }));
    }
  }

  function onSaveClick(e: CustomEvent) {
    setPreferences(tempPreferences);

    if (onDismiss) {
      onDismiss(new CustomEvent(e.type, { detail: { reason: 'save' } }));
    }
  }

  return (
    <Modal
      {...props}
      header={'Preferences'}
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
      <ColumnLayout columns={1}>
        {
          !consentLevels.has(ConsentLevel.FUNCTIONALITY) && <Alert type={'warning'}><Box>You have not given permission for <Box variant={'strong'}>functional cookies</Box>. Your choice <Box variant={'strong'}>will not persist</Box> across page loads.</Box></Alert>
        }
        <div>
          <Header variant={'h3'}>Theme</Header>
          <Tiles
            value={tempPreferences.colorScheme}
            onChange={(e) => {
              setTempPreferences((prev) => ({ ...prev, colorScheme: e.detail.value as ColorScheme }));
            }}
            items={[
              {
                label: 'System',
                description: 'Use your system default theme',
                value: ColorScheme.SYSTEM,
              },
              {
                label: 'Light',
                description: 'Classic light theme',
                value: ColorScheme.LIGHT,
              },
              {
                label: 'Dark',
                description: 'Classic dark theme',
                value: ColorScheme.DARK,
              },
            ]}
          />
        </div>
        <div>
          <Header variant={'h3'}>Density</Header>
          <Tiles
            value={tempPreferences.uiDensity}
            onChange={(e) => {
              setTempPreferences((prev) => ({ ...prev, uiDensity: e.detail.value as UIDensity }));
            }}
            items={[
              {
                label: 'Comfortable',
                description: 'Standard spacing',
                value: UIDensity.COMFORTABLE,
              },
              {
                label: 'Compact',
                description: 'Reduced spacing',
                value: UIDensity.COMPACT,
              },
            ]}
          />
        </div>
      </ColumnLayout>
    </Modal>
  );
}
