import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/primitives';
import { SimpleSelect } from '@/components/SimpleSelect';
import { fullDateLabel } from '@/lib/format';
import styles from './ConnectionDateNavigation.module.css';

export function ConnectionDateNavigation({
  dates,
  value,
  onChange,
}: {
  dates: readonly string[];
  value: string;
  onChange: (date: string) => void;
}) {
  const index = dates.indexOf(value);
  const previous = dates[index - 1];
  const next = dates[index + 1];

  return (
    <nav className={styles.navigation} aria-label='Connection departure dates'>
      <Button
        variant='secondary'
        aria-label='Previous departure date'
        disabled={!previous}
        onClick={() => {
          if (previous) {
            onChange(previous);
          }
        }}
      >
        <ChevronLeft size={17} aria-hidden='true' />
      </Button>
      <SimpleSelect
        aria-label='Journey departure date (local)'
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {dates.map((date) => (
          <option key={date} value={date}>
            {fullDateLabel(date)}
          </option>
        ))}
      </SimpleSelect>
      <Button
        variant='secondary'
        aria-label='Next departure date'
        disabled={!next}
        onClick={() => {
          if (next) {
            onChange(next);
          }
        }}
      >
        <ChevronRight size={17} aria-hidden='true' />
      </Button>
    </nav>
  );
}
