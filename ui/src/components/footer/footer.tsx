import {
  Box, Link, LinkProps, SpaceBetween,
} from '@cloudscape-design/components';
import React from 'react';
import { useI18n } from '../util/context/i18n';
import { useMobile } from '../util/state/common';
import classes from './footer.module.scss';
import { RouterLink } from '../common/router-link';

export interface FlightsFooterProps {
  onCookiePreferencesClick: (e: CustomEvent<LinkProps.FollowDetail>) => void;
}

export default function FlightsFooter(props: FlightsFooterProps) {
  const i18n = useI18n();
  const isMobile = useMobile();

  return (
    <footer id="flights-custom-footer" className={classes['flights-footer']}>
      <SpaceBetween size={isMobile ? 'xs' : 'm'} direction={isMobile ? 'vertical' : 'horizontal'}>
        <RouterLink to={'/legal'}>Legal</RouterLink>
        <RouterLink to={'/privacy-policy'}>Privacy Policy</RouterLink>
        <Link variant={'secondary'} href={'#'} onFollow={props.onCookiePreferencesClick}>Cookie Preferences</Link>
        <Box variant={'span'}>© 2024 Felix</Box>
      </SpaceBetween>
    </footer>
  );
}
