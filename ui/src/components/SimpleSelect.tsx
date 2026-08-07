import type { SelectHTMLAttributes } from 'react';
import { classNames } from '@/lib/format';

export function SimpleSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={classNames('simple-select', className)} {...props} />;
}
