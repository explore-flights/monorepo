import {
  Box, Link, LinkProps, SpaceBetween,
} from '@cloudscape-design/components';
import React from 'react';
import { useMobile } from '../util/state/common';
import classes from './footer.module.scss';
import { RouterLink } from '../common/router-link';

export interface FlightsFooterProps {
  onPrivacyPreferencesClick: (e: CustomEvent<LinkProps.FollowDetail>) => void;
}

export default function FlightsFooter(props: FlightsFooterProps) {
  const isMobile = useMobile();

  return (
    <footer id="flights-custom-footer" className={classes['flights-footer']}>
      <SpaceBetween size={isMobile ? 'xs' : 'm'} direction={isMobile ? 'vertical' : 'horizontal'}>
        <RouterLink to={'/legal'} rel={'terms-of-service'}>Legal</RouterLink>
        <RouterLink to={'/privacy-policy'} rel={'privacy-policy'}>Privacy Policy</RouterLink>
        <Link variant={'secondary'} href={'#'} onFollow={props.onPrivacyPreferencesClick}>Privacy Preferences</Link>
        <Box variant={'span'}>© 2024-2025 Felix</Box>
      </SpaceBetween>
    </footer>
  );
}
