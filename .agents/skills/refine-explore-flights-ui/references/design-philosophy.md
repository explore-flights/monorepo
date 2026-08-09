# UI design philosophy

Read this reference for design passes, new UI, filter behavior, information architecture, and
responsive review. It records decisions repeatedly reinforced during the flight, fleet, connection,
search, and picker work.

## Keep the interface calm and honest

- Remove information, controls, labels, and card boundaries that repeat state already visible.
- Give every remaining element a distinct purpose. Do not add decorative insights without useful
  drill-down behavior.
- Flatten card layers that do not establish meaningful hierarchy.
- Keep contextual actions with the entity they affect.

## Make state visible

- Implement Upcoming, Historical, and similar presets as shortcuts that populate ordinary fields.
- Clicking an active preset toggles it off. Manually clearing inputs shows all data.
- Clear all leaves no hidden filters or silently restored defaults.
- Show date and other filters in the same active-filter summary and allow individual removal.
- Defaults may be useful, but the user must be able to reach a genuinely unfiltered state.

## Use exact language and counts

- Distinguish departure dates, published legs/departures, operating records, cancelled records,
  revised legs, dates with history, aircraft types, routes, and route pairs.
- State the unit and use the unfiltered total as the denominator unless the copy says otherwise.
- Prefer domain language such as stopover, scheduled, cancelled, configuration, previous, and
  published now. Do not expose implementation terms as primary copy.
- Use raw codes as secondary detail or as a safe fallback when no friendly name exists.

## Connect summaries to evidence

- Clicking an insight should navigate to, reveal, scroll to, or highlight the detailed records that
  support it.
- Avoid indirect filters that can appear to do nothing.
- Keep summary calculations within the active filter scope.
- Prefer expansion for supporting detail when leaving the current context adds no value.

## Preserve domain groupings

- Treat a multi-leg flight number as one journey and keep its legs together across dates, periods,
  history, and changes.
- Group fleet schedules primarily by route pair, with direction, flight number, periods, equipment,
  and configuration inside.
- Preserve unchanged context while highlighting differences.

## Prefer progressive disclosure

- Compact cards should show the decision-relevant summary and expand to complete detail.
- Keep complex data accessible rather than shrinking, truncating, or hiding it.
- Keep full-year calendars visible. Dim filtered scheduled dates; distinguish dates with no schedule;
  link a selected date to discoverable detail.
- Use progressive list rendering for large local option sets while filtering the complete dataset.

## Design responsive behavior, not responsive compression

- At narrow widths, restructure grids into fewer columns or vertical stacks.
- Keep readable tokenized type sizes and never introduce sub-12px copy.
- Make touch targets generous. If a chip has no action besides removal, make the whole chip remove it.
- Test intermediate tablet widths and real-phone behavior, especially iOS focus, blur, fullscreen
  picker, draft-selection, and Done/cancel semantics.
- Preserve desktop behavior when applying a mobile-specific fix.

## Reuse before adding

- Reuse filters, scope tabs, calendar cells, show-more controls, option mapping/ranking, schedule
  metadata, picker sessions, token inputs, and feed-link treatments.
- Fix a shared component globally when multiple pages should behave the same.
- Keep responsibilities separate when semantics differ: free-form tag parsing is not picker
  selection; query input is not the selection transaction; option rendering is not filtering.

## Review checklist

- Remove duplicated concepts and unnecessary card layers.
- Verify that empty and cleared filters show all relevant data.
- Check every count's unit and denominator.
- Make every interactive summary reveal its evidence.
- Test unusually complex records and empty/error/loading cases.
- Test wide desktop, 944px, and 375–390px, in light and dark themes where relevant.
- Check horizontal overflow, stacking, focus, keyboard interaction, touch targets, and console errors.
