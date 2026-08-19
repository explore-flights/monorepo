import { GitBranch } from 'lucide-react';
import { MultiCombobox } from './MultiCombobox';
import type { SelectOption } from './picker/types';
import { SimpleSelect } from './SimpleSelect';

export function AirportRouteField({
  label,
  endpoint,
  values,
  options,
  onChange,
}: {
  label: string;
  endpoint: 'origin' | 'destination';
  values: readonly string[];
  options: readonly SelectOption[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className='airport-field'>
      <span>
        <span className={`route-dot ${endpoint}`} />
        {label}
      </span>
      <MultiCombobox
        label={label}
        values={values}
        options={options}
        onChange={onChange}
        placeholder='Select one or more airports'
        uppercase
      />
    </div>
  );
}

export function MaximumFlightsField({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span>
        <GitBranch size={15} />
        Maximum flights
      </span>
      <SimpleSelect value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {[1, 2, 3, 4].map((option) => (
          <option key={option} value={option}>
            {option} flight{option === 1 ? '' : 's'}
          </option>
        ))}
      </SimpleSelect>
    </label>
  );
}
