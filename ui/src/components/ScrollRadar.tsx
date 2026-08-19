import { useEffect, useRef } from 'react';
import styles from './ScrollRadar.module.css';

const radarDegreesPerPixel = 0.24;

export function ScrollRadar() {
  const radarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const radar = radarRef.current;
    if (!radar || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const radarElement = radar;

    let animationFrame: number | undefined;

    function updateAngle() {
      animationFrame = undefined;
      radarElement.style.setProperty(
        '--scroll-radar-angle',
        `${window.scrollY * radarDegreesPerPixel}deg`,
      );
    }

    function queueUpdate() {
      if (animationFrame !== undefined) {
        return;
      }

      animationFrame = window.requestAnimationFrame(updateAngle);
    }

    updateAngle();
    window.addEventListener('scroll', queueUpdate, { passive: true });

    return () => {
      window.removeEventListener('scroll', queueUpdate);
      if (animationFrame !== undefined) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, []);

  return (
    <div ref={radarRef} className={styles.radar} data-scroll-radar aria-hidden='true'>
      <span className={styles.sweep} />
    </div>
  );
}
