import { AlertCircle, LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, Ref } from 'react';
import { classNames, numberLabel } from '@/lib/format';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type BadgeTone = 'neutral' | 'blue' | 'amber' | 'red';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  ref?: Ref<HTMLButtonElement>;
}

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
}

interface PageHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

interface ErrorStateProps {
  error: Error;
  title?: string;
}

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

interface StatProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}

export function Button({ className, type = 'button', variant = 'primary', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={classNames('button', `button-${variant}`, className)}
      {...props}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classNames('card', className)} {...props} />;
}

export function Badge({ children, tone = 'neutral' }: BadgeProps) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className='page-header'>
      <div>
        {eyebrow && <div className='eyebrow'>{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className='page-actions'>{actions}</div>}
    </header>
  );
}

export function Loading({ label = 'Loading data…' }: { label?: string }) {
  return (
    <div className='state-panel'>
      <LoaderCircle className='spin' size={24} />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ error, title = 'Could not load this view' }: ErrorStateProps) {
  return (
    <div className='state-panel state-error'>
      <AlertCircle size={24} />
      <div>
        <strong>{title}</strong>
        <p>{error.message}</p>
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className='empty-state'>
      <div className='empty-mark'>✦</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint }: StatProps) {
  const displayValue = typeof value === 'number' ? numberLabel(value) : value;

  return (
    <Card className='stat'>
      <span>{label}</span>
      <strong>{displayValue}</strong>
      {hint && <small>{hint}</small>}
    </Card>
  );
}
