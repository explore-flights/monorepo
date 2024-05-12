import React from 'react';
import { Box, SpaceBetween, Textarea } from '@cloudscape-design/components';


export interface ValueMultilineEditorProps {
  values: ReadonlyArray<string>;
  setValues: React.Dispatch<React.SetStateAction<ReadonlyArray<string>>>;
  disabled: boolean;
  placeholder: string;
}

export function ValueMultilineEditor({ values, disabled, setValues, placeholder }: ValueMultilineEditorProps) {
  return (
    <SpaceBetween size={'xxs'} direction={'vertical'}>
      <Textarea
        value={values.join('\n')}
        onChange={(e) => setValues(e.detail.value.split('\n'))}
        spellcheck={false}
        disableBrowserAutocorrect={true}
        autoComplete={false}
        disabled={disabled}
        rows={Math.min(values.length, 20)}
        placeholder={placeholder}
      />
      <Box variant={'small'}>one value per line; supports glob patterns</Box>
    </SpaceBetween>
  )
}