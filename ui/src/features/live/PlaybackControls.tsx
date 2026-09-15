import { useState } from 'react';
import { TemporalInput } from '@/components/TemporalInput';
import { SimpleSelect } from '@/components/SimpleSelect';
import { Button } from '@/components/primitives';
import { ChevronDown } from 'lucide-react';
import { parseSimulationInput, simulationInputValue } from './playback';
import styles from './LivePage.module.css';

const simulationTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'medium',
});

export function PlaybackControls({
  now,
  speed,
  seek,
  setSpeed,
  goLive,
  flightCount,
}: {
  now: number;
  speed: number;
  seek: (time: number) => void;
  setSpeed: (speed: number) => void;
  goLive: () => void;
  flightCount: number;
}) {
  const [draft, setDraft] = useState<{ value: string; initialValue: string }>();
  const [error, setError] = useState(false);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  function apply(value: string) {
    const time = parseSimulationInput(value);
    if (time === undefined) {
      setError(true);
      return;
    }
    if (value !== simulationInputValue(now)) {
      seek(time);
    }
    setDraft(undefined);
    setError(false);
  }
  return (
    <details className={styles.secondaryControls}>
      <summary>
        <time className={styles.collapsedTime} dateTime={new Date(now).toISOString()}>
          {simulationTimeFormatter.format(now)}
        </time>
        <span className={styles.expandedSummary}>Hide controls</span>
        <ChevronDown size={16} aria-hidden='true' />
      </summary>
      <div className={styles.secondaryControlsBody}>
        <div className={styles.timeField}>
          <label htmlFor='simulation-time'>
            Simulation time <small>({timezone})</small>
          </label>
          <TemporalInput
            id='simulation-time'
            type='datetime-local'
            step={1}
            min='0001-01-01T00:00:00'
            max='9999-12-31T23:59:59'
            value={draft?.value ?? simulationInputValue(now)}
            aria-describedby={error ? 'simulation-time-help' : undefined}
            aria-invalid={error}
            onFocus={(event) =>
              setDraft({
                value: event.currentTarget.value,
                initialValue: simulationInputValue(now),
              })
            }
            onChange={(event) => {
              const value = event.currentTarget.value;
              setDraft((previous) => ({
                value,
                initialValue: previous?.initialValue ?? simulationInputValue(now),
              }));
              setError(false);
            }}
            onBlur={(event) => {
              if (
                draft &&
                parseSimulationInput(event.currentTarget.value) !==
                  parseSimulationInput(draft.initialValue)
              ) {
                apply(event.currentTarget.value);
              } else {
                setDraft(undefined);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              }
              if (event.key === 'Escape') {
                setDraft(undefined);
                setError(false);
              }
            }}
          />
          {error && (
            <span id='simulation-time-help' className={styles.timeHelp}>
              Enter a valid local date and time.
            </span>
          )}
        </div>
        <div className={styles.playbackActions}>
          <label className={styles.speedField}>
            <span>Playback speed</span>
            <SimpleSelect
              value={speed}
              onChange={(event) => setSpeed(Number(event.currentTarget.value))}
            >
              <option value={0}>Paused</option>
              {[0.5, 1, 2, 5, 10, 30].map((value) => (
                <option key={value} value={value}>
                  {value}×{value === 1 ? ' (realtime)' : ''}
                </option>
              ))}
            </SimpleSelect>
          </label>
          <Button
            onClick={() => {
              setDraft(undefined);
              setError(false);
              goLive();
            }}
          >
            Go live
          </Button>
          <div className={styles.status} aria-live='polite'>
            {flightCount.toLocaleString()} scheduled flights in the air
          </div>
        </div>
      </div>
    </details>
  );
}
