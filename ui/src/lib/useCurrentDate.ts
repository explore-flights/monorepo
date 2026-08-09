import { useState } from 'react';

export function useCurrentDate(): Date {
  const [currentDate] = useState(() => new Date());
  return currentDate;
}
