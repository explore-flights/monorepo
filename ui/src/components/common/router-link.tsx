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
      href={href}
      onFollow={(e) => {
        e.preventDefault();
        navigate(to);
      }}
      {...linkProps}
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
        e.preventDefault();
        navigate(to);
      }}
      variant={'inline-link'}
      {...buttonProps}
    />
  );
}
