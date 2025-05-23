import {
  Button, ButtonProps, Link, LinkProps, 
} from '@cloudscape-design/components';
import React from 'react';
import { To, useHref, useNavigate } from 'react-router-dom';

export interface RouterLinkProps extends LinkProps {
  to: To;
}

export function RouterLink(props: RouterLinkProps) {
  const { to, ...linkProps } = props;
  const href = useHref(to);
  const navigate = useNavigate();
  
  return (
    <Link
      {...linkProps}
      href={href}
      onFollow={(e) => {
        if (linkProps.target) {
          return;
        }

        if (linkProps.onFollow) {
          linkProps.onFollow(e);
        }

        e.preventDefault();
        navigate(to);
      }}
    />
  );
}

export interface RouterInlineLinkProps extends ButtonProps {
  to: To;
}

export function RouterInlineLink(props: RouterInlineLinkProps) {
  const { to, ...buttonProps } = props;
  const href = useHref(to);
  const navigate = useNavigate();

  return (
    <Button
      href={href}
      onFollow={(e) => {
        if (buttonProps.target) {
          return;
        }

        if (buttonProps.onFollow) {
          buttonProps.onFollow(e);
        }

        e.preventDefault();
        navigate(to);
      }}
      variant={'inline-link'}
      {...buttonProps}
    />
  );
}
