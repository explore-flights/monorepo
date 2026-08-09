import { Rss } from 'lucide-react';
import { classNames } from '@/lib/format';

export function FlightHistoryFeedLinks({
  flightNumber,
  airport,
  date,
  compact = false,
}: {
  flightNumber: string;
  airport: string;
  date: string;
  compact?: boolean;
}) {
  const base = `/data/flight/${encodeURIComponent(flightNumber)}/versions/${encodeURIComponent(airport)}/${encodeURIComponent(date)}`;

  return (
    <span
      className={classNames('history-feed-links', compact && 'history-feed-links-compact')}
      aria-label='Version history feeds'
    >
      <FeedLink href={`${base}/feed.rss`} label='RSS' />
      <FeedLink href={`${base}/feed.atom`} label='Atom' />
    </span>
  );
}

function FeedLink({ href, label }: { href: string; label: string }) {
  const type = href.endsWith('.atom') ? 'application/atom+xml' : 'application/rss+xml';
  return (
    <a href={href} target='_blank' rel='nofollow noreferrer' type={type}>
      <Rss size={12} />
      {label}
    </a>
  );
}
