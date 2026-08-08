import type { InputHTMLAttributes } from 'react';

type TemporalInputType = 'date' | 'datetime-local' | 'month' | 'time' | 'week';

interface TemporalInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  type: TemporalInputType;
}

export function TemporalInput({ type, ...props }: TemporalInputProps) {
  return (
    <span className='temporal-control'>
      <input {...props} type={type} />
    </span>
  );
}
