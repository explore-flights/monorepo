import type { ReactNode } from 'react';
import styles from './Picker.module.css';

export function DesktopDropdown({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className={styles.menu}>
      {children}
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </div>
  );
}
