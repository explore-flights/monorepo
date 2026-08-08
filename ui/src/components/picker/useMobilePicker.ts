import { useEffect, useState } from 'react';

const mobilePickerQuery = '(max-width: 1024px)';

export function useMobilePicker() {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(mobilePickerQuery).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(mobilePickerQuery);
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return mobile;
}
