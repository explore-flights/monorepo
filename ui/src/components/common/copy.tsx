import {
  Box, BoxProps, Button, ButtonProps, Popover, PopoverProps, StatusIndicator, StatusIndicatorProps,
} from '@cloudscape-design/components';
import React, { useMemo } from 'react';
import { useClipboard } from '../util/state/common';

export interface CopyProps extends BoxProps {
  copyText: string;
  position?: PopoverProps.Position;
}

export function Copy({
  copyText, position, children, ...boxProps 
}: CopyProps) {
  return (
    <Box margin={{ right: 'xxs' }} {...boxProps}>
      <CopyButton copyText={copyText} position={position} variant={'inline-icon'} />
      {children}
    </Box>
  );
}

export interface CopyButtonProps extends ButtonProps {
  copyText: string;
  position?: PopoverProps.Position;
}

export function CopyButton({ copyText, position, ...buttonProps }: CopyButtonProps) {
  const [loading, value, copy] = useClipboard();
  const [status, message] = useMemo<[StatusIndicatorProps.Type, string]>(() => {
    if (loading) {
      return ['in-progress', 'Copying...'];
    }

    if (value === copyText) {
      return ['success', 'Copied!'];
    }

    return ['error', 'Failed to copy'];
  }, [loading, value]);

  return (
    <Popover
      size={'small'}
      position={position ?? 'top'}
      dismissButton={false}
      triggerType={'custom'}
      content={<StatusIndicator type={status}>{message}</StatusIndicator>}
    >
      <Button
        iconName={'copy'}
        onClick={() => copy(copyText)}
        loading={loading}
        {...buttonProps}
      />
    </Popover>
  );
}
