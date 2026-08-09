import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import styles from './Picker.module.css';

interface MobilePickerDialogProps {
  open: boolean;
  title: string;
  initialFocusRef: RefObject<HTMLInputElement | null>;
  children: ReactNode;
  footer?: ReactNode;
  onCancel: () => void;
}

export function MobilePickerDialog({
  open,
  title,
  initialFocusRef,
  children,
  footer,
  onCancel,
}: MobilePickerDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) {
      return;
    }
    dialog.showModal();
    const frame = window.requestAnimationFrame(() => initialFocusRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      if (dialog.open) {
        dialog.close();
      }
    };
  }, [initialFocusRef, open]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className={styles.mobileDialog}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className={styles.mobileDialogFrame}>
        <header className={styles.mobileHeader}>
          <strong>{title}</strong>
          <button type='button' aria-label={`Close ${title}`} onClick={onCancel}>
            <X size={20} />
          </button>
        </header>
        {children}
        {footer && <footer className={styles.mobileFooter}>{footer}</footer>}
      </div>
    </dialog>,
    document.body,
  );
}
