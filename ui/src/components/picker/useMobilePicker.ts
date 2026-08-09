import { useSyncExternalStore } from 'react';

const mobilePickerQuery = '(max-width: 1024px)';

export function useMobilePicker() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(mobilePickerQuery).matches,
    () => false,
  );
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia(mobilePickerQuery);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
