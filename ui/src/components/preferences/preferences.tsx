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
import React, { useEffect, useMemo, useState } from 'react';
import { ConsentLevel } from '../../lib/consent.model';
import { I18N_FLIGHTS } from '../../lib/i18n/i18n-strings';
import {
  ColorScheme, DateFormat, Locale, Preferences, UIDensity, 
} from '../../lib/preferences.model';
import { useI18n } from '../util/context/i18n';
import { useConsent } from '../util/state/use-consent';
import { ISO8601DateFormatter, localeDateFormatter, SystemDateFormatter } from '../util/state/use-dateformat';
import { resolveEffectiveLocale, usePreferences, useSystemLocale } from '../util/state/use-preferences';

export function PreferencesModal(props: ModalProps) {
  const i18n = useI18n();
  const [consentLevels] = useConsent();
  const systemLocale = useSystemLocale();
  const [preferences, setPreferences] = usePreferences();
  const [tempPreferences, setTempPreferences] = useState<Preferences>(preferences);
  const date = useMemo(() => new Date(), []);

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
          <Header variant={'h3'}>Locale</Header>
          <Tiles
            value={tempPreferences.locale}
            onChange={(e) => {
              setTempPreferences((prev) => ({ ...prev, locale: e.detail.value as Locale }));
            }}
            items={[
              {
                label: 'System',
                value: Locale.SYSTEM,
              },
              {
                label: 'English',
                value: Locale.EN,
              },
            ]}
          />
        </div>
        <div>
          <Header variant={'h3'}>Date and Time Format</Header>
          <Tiles
            value={tempPreferences.dateFormat}
            onChange={(e) => {
              setTempPreferences((prev) => ({ ...prev, dateFormat: e.detail.value as DateFormat }));
            }}
            items={[
              {
                label: 'System',
                description: SystemDateFormatter.formatDateTime(date),
                value: DateFormat.SYSTEM,
              },
              {
                label: 'Locale',
                description: localeDateFormatter(I18N_FLIGHTS[resolveEffectiveLocale(tempPreferences.locale, systemLocale)]).formatDateTime(date),
                value: DateFormat.LOCALE,
              },
              {
                label: 'ISO8601',
                description: ISO8601DateFormatter.formatDateTime(date),
                value: DateFormat.ISO_8601,
              },
            ]}
          />
        </div>
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
