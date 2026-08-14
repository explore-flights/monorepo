import { ChevronDown, ChevronRight } from 'lucide-react';

export function CenterSectionToggle({
  expanded,
  label,
  controls,
  onToggle,
}: {
  expanded: boolean;
  label: string;
  controls?: string;
  onToggle: () => void;
}) {
  return (
    <>
      <button
        type='button'
        className='center-section-toggle'
        aria-label={label}
        aria-controls={controls}
        aria-expanded={expanded}
        onClick={onToggle}
      />
      <span className='center-section-chevron' aria-hidden='true'>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </span>
    </>
  );
}
