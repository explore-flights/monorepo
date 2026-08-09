import type { FlightReferenceData, FlightScheduleItem } from '@/api/types';
import { addDays, daysBetween, weekdayForDate } from '@/lib/date';
import { displayVariantFor } from '@/lib/schedules';
import { localArrivalSchedule } from '@/lib/time';

const minimumRecurringOccurrences = 2;
const minimumStandaloneRunDates = 7;
const nearbyTransitionDays = 14;
const weekdayOrder = [1, 2, 3, 4, 5, 6, 0] as const;

export interface JourneyDay {
  date: string;
  legs: FlightScheduleItem[];
}

export interface WeeklySchedulePattern {
  signature: string;
  basis: 'exact' | 'schedule';
  weekdays: number[];
  days: JourneyDay[];
  representativeDay: JourneyDay;
}

export interface SchedulePeriod {
  start: string;
  end: string;
  days: JourneyDay[];
  signature: string;
  basis: 'exact' | 'schedule';
  presentation: 'basic' | 'weekday';
  patterns: WeeklySchedulePattern[];
  exceptionDates: string[];
}

interface TimetableOccurrence {
  day: JourneyDay;
  weekday: number;
  rawSignature: string;
  resolvedSignature: string;
  affinityMatchesResolved: boolean;
}

interface SignatureRun {
  start: number;
  end: number;
  signature: string;
}

interface TransitionEvent {
  date: string;
  weekday: number;
}

interface StandaloneScheduleRun {
  start: string;
  nextStart: string;
  dates: string[];
}

export function groupSchedulePeriods(
  days: readonly JourneyDay[],
  data: FlightReferenceData,
): SchedulePeriod[] {
  const sorted = [...days].sort((left, right) => left.date.localeCompare(right.date));
  const first = sorted[0];
  const last = sorted.at(-1);
  if (!first || !last) {
    return [];
  }

  const inferredOccurrences = resolveTimetableOccurrences(sorted, data);
  const inferredOccurrenceByDate = new Map(
    inferredOccurrences.map((occurrence) => [occurrence.day.date, occurrence]),
  );
  const standaloneRuns = standaloneScheduleRuns(sorted, inferredOccurrenceByDate);
  const standaloneDates = new Set(standaloneRuns.flatMap((run) => run.dates));
  const occurrences = inferredOccurrences.map((occurrence) => {
    if (!standaloneDates.has(occurrence.day.date)) {
      return occurrence;
    }

    return {
      ...occurrence,
      resolvedSignature: occurrence.rawSignature,
      affinityMatchesResolved: true,
    };
  });
  const occurrenceByDate = new Map(
    occurrences.map((occurrence) => [occurrence.day.date, occurrence]),
  );
  const transitions = transitionEvents(occurrences);
  const standaloneBoundaries = standaloneRuns.flatMap((run) => [run.start, run.nextStart]);
  const boundaries = [first.date, ...mergeNearbyTransitions(transitions), ...standaloneBoundaries]
    .filter((date, index) => (date > first.date && date <= last.date) || index === 0)
    .sort((left, right) => left.localeCompare(right))
    .filter((date, index, values) => index === 0 || date !== values[index - 1]);

  return boundaries.flatMap((start, index) => {
    const nextStart = boundaries[index + 1];
    const end = nextStart ? previousDate(nextStart) : last.date;
    const periodDays = sorted.filter((day) => day.date >= start && day.date <= end);
    return buildValidSchedulePeriods(start, end, periodDays, occurrenceByDate, data);
  });
}

function standaloneScheduleRuns(
  days: readonly JourneyDay[],
  occurrenceByDate: ReadonlyMap<string, TimetableOccurrence>,
): StandaloneScheduleRun[] {
  const runs = signatureRuns(days.map(exactVariantSignature));
  return runs.flatMap((run) => {
    const previous = days[run.start - 1];
    const first = days[run.start];
    const last = days[run.end];
    const next = days[run.end + 1];
    if (!previous || !first || !last || !next) {
      return [];
    }

    const runDays = days.slice(run.start, run.end + 1);
    if (
      runDays.length < minimumStandaloneRunDates ||
      runDays.some((day) => day.legs.some((item) => currentVariantId(item) === undefined))
    ) {
      return [];
    }

    const runDates = runDays.map((day) => day.date);
    const isAbsorbed = runDates.some((date) => {
      const occurrence = occurrenceByDate.get(date);
      return occurrence !== undefined && occurrence.rawSignature !== occurrence.resolvedSignature;
    });
    if (!isAbsorbed) {
      return [];
    }

    // Requiring every local date keeps filtered or sparse schedules from promoting one-off changes.
    const adjacentDates = [previous.date, ...runDates, next.date];
    const isConsecutive = adjacentDates.every(
      (date, index) => index === 0 || daysBetween(adjacentDates[index - 1], date) === 1,
    );
    if (!isConsecutive) {
      return [];
    }

    return [{ start: first.date, nextStart: next.date, dates: runDates }];
  });
}

function buildSchedulePeriod(
  start: string,
  end: string,
  days: JourneyDay[],
  occurrenceByDate: ReadonlyMap<string, TimetableOccurrence>,
  data: FlightReferenceData,
): SchedulePeriod {
  const expectedTimetableByWeekday = expectedWeekdaySignatures(start, end, days, occurrenceByDate);
  const coreRegularDays = days.filter((day) => {
    const expected = expectedTimetableByWeekday.get(weekdayOf(day.date));
    return (
      expected !== undefined &&
      day.legs.every((item) => currentVariantId(item) !== undefined) &&
      timetableSignature(day, data) === expected
    );
  });
  const coreRegularDates = new Set(coreRegularDays.map((day) => day.date));
  const coreExceptionDays = days.filter((day) => !coreRegularDates.has(day.date));
  const schedulePatterns = buildPatterns(
    coreRegularDays,
    (day) => timetableSignature(day, data),
    'schedule',
  );
  let patterns: WeeklySchedulePattern[] = [];
  const exactExceptionDays: JourneyDay[] = [];
  for (const schedulePattern of schedulePatterns) {
    const expectedExactByWeekday = new Map<number, string>();
    for (const weekday of schedulePattern.weekdays) {
      const signatures = schedulePattern.days.flatMap((day) =>
        weekdayOf(day.date) === weekday ? [exactVariantSignature(day)] : [],
      );
      const signature = mode(signatures)?.value;
      if (signature) {
        expectedExactByWeekday.set(weekday, signature);
      }
    }

    const exactRegularDays = schedulePattern.days.filter(
      (day) => exactVariantSignature(day) === expectedExactByWeekday.get(weekdayOf(day.date)),
    );
    const exactRegularDates = new Set(exactRegularDays.map((day) => day.date));
    const patternExceptionDays = schedulePattern.days.filter(
      (day) => !exactRegularDates.has(day.date),
    );
    if (exceptionsWithinThreshold(exactRegularDays.length, patternExceptionDays.length)) {
      patterns.push(
        ...buildPatterns(exactRegularDays, (day) => exactVariantSignature(day), 'exact'),
      );
      exactExceptionDays.push(...patternExceptionDays);
    } else {
      patterns.push(schedulePattern);
    }
  }

  let exceptionDays = [...coreExceptionDays, ...exactExceptionDays];
  const regularDateCount = patterns.reduce((total, pattern) => total + pattern.days.length, 0);
  if (!exceptionsWithinThreshold(regularDateCount, exceptionDays.length)) {
    patterns = schedulePatterns;
    exceptionDays = coreExceptionDays;
  }

  const basis = patterns.every((pattern) => pattern.basis === 'exact') ? 'exact' : 'schedule';

  const exceptionDates = [...new Set(exceptionDays.map((day) => day.date))].sort();
  const signature = [...expectedTimetableByWeekday]
    .sort(([left], [right]) => compareWeekdays(left, right))
    .map(([weekday, timetable]) => `${weekday}:${timetable}`)
    .join('||');

  return {
    start,
    end,
    days,
    signature,
    basis,
    presentation: patterns.length > 1 ? 'weekday' : 'basic',
    patterns,
    exceptionDates,
  };
}

function buildValidSchedulePeriods(
  start: string,
  end: string,
  days: JourneyDay[],
  occurrenceByDate: ReadonlyMap<string, TimetableOccurrence>,
  data: FlightReferenceData,
): SchedulePeriod[] {
  const period = buildSchedulePeriod(start, end, days, occurrenceByDate, data);
  const regularDateCount = period.patterns.reduce(
    (total, pattern) => total + pattern.days.length,
    0,
  );
  if (exceptionsWithinThreshold(regularDateCount, period.exceptionDates.length)) {
    return [period];
  }

  if (days.length === 1) {
    return [buildSingleDatePeriod(start, end, days[0], data)];
  }

  const splitIndex = Math.ceil(days.length / 2);
  const nextStart = days[splitIndex].date;
  return [
    ...buildValidSchedulePeriods(
      start,
      previousDate(nextStart),
      days.slice(0, splitIndex),
      occurrenceByDate,
      data,
    ),
    ...buildValidSchedulePeriods(nextStart, end, days.slice(splitIndex), occurrenceByDate, data),
  ];
}

function buildSingleDatePeriod(
  start: string,
  end: string,
  day: JourneyDay,
  data: FlightReferenceData,
): SchedulePeriod {
  const basis = day.legs.every((item) => currentVariantId(item) !== undefined)
    ? 'exact'
    : 'schedule';
  const patternSignature =
    basis === 'exact' ? exactVariantSignature(day) : timetableSignature(day, data);
  return {
    start,
    end,
    days: [day],
    signature: `single:${day.date}:${patternSignature}`,
    basis,
    presentation: 'basic',
    patterns: [
      {
        signature: patternSignature,
        basis,
        weekdays: [weekdayOf(day.date)],
        days: [day],
        representativeDay: day,
      },
    ],
    exceptionDates: [],
  };
}

function expectedWeekdaySignatures(
  start: string,
  end: string,
  days: readonly JourneyDay[],
  occurrenceByDate: ReadonlyMap<string, TimetableOccurrence>,
) {
  const result = new Map<number, string>();
  const minimumWeekdayDates = daysBetween(start, end) >= 13 ? minimumRecurringOccurrences : 1;
  for (const weekday of weekdayOrder) {
    const signatures = days.flatMap((day) => {
      const occurrence = occurrenceByDate.get(day.date);
      return occurrence?.weekday === weekday ? [occurrence.resolvedSignature] : [];
    });
    const signature = mode(signatures)?.value;
    if (signature && signatures.length >= minimumWeekdayDates) {
      result.set(weekday, signature);
    }
  }

  if (result.size === 0) {
    for (const day of days) {
      const occurrence = occurrenceByDate.get(day.date);
      if (occurrence) {
        result.set(occurrence.weekday, occurrence.resolvedSignature);
      }
    }
  }
  return result;
}

function buildPatterns(
  days: readonly JourneyDay[],
  signatureFor: (day: JourneyDay) => string,
  basis: WeeklySchedulePattern['basis'],
) {
  return [...Map.groupBy(days, signatureFor)]
    .filter(([signature]) => signature.length > 0)
    .map(([signature, matchingDays]) => ({
      signature,
      basis,
      weekdays: [...new Set(matchingDays.map((day) => weekdayOf(day.date)))].sort(compareWeekdays),
      days: matchingDays,
      representativeDay: matchingDays[0],
    }))
    .sort((left, right) => compareWeekdays(left.weekdays[0], right.weekdays[0]));
}

function resolveTimetableOccurrences(
  days: readonly JourneyDay[],
  data: FlightReferenceData,
): TimetableOccurrence[] {
  const byWeekday = Map.groupBy(days, (day) => weekdayOf(day.date));
  return [...byWeekday]
    .flatMap(([weekday, weekdayDays]) => {
      const rawSignatures = weekdayDays.map((day) => timetableSignature(day, data));
      const affinitySignatures = weekdayDays.map((day) => timetableAffinitySignature(day, data));
      const signatures = absorbMinorityRuns(rawSignatures);
      const runs = signatureRuns(signatures);
      const stableRuns = runs.filter(
        (run) => run.end - run.start + 1 >= minimumRecurringOccurrences,
      );
      const fallback = mode(signatures)?.value ?? '';
      return weekdayDays.map((day, index) => {
        const run = runs.find((candidate) => index >= candidate.start && index <= candidate.end);
        const stableRun = stableRuns.find(
          (candidate) => index >= candidate.start && index <= candidate.end,
        );
        let resolvedSignature = stableRun?.signature;
        if (!resolvedSignature) {
          const previous = stableRuns.filter((candidate) => candidate.end < index).at(-1);
          const next = stableRuns.find((candidate) => candidate.start > index);
          resolvedSignature =
            nearestStableSignature(
              index,
              affinitySignatures[index],
              affinitySignatures,
              previous,
              next,
            ) ??
            run?.signature ??
            fallback;
        }
        const affinityMatchesResolved = stableRuns.some(
          (candidate) =>
            candidate.signature === resolvedSignature &&
            affinitySignatures[candidate.start] === affinitySignatures[index],
        );
        return {
          day,
          weekday,
          rawSignature: rawSignatures[index],
          resolvedSignature,
          affinityMatchesResolved,
        };
      });
    })
    .sort((left, right) => left.day.date.localeCompare(right.day.date));
}

function absorbMinorityRuns(signatures: readonly string[]) {
  const resolved = [...signatures];
  let changed = true;
  while (changed) {
    changed = false;
    const runs = signatureRuns(resolved);
    for (let index = 1; index < runs.length - 1; index += 1) {
      const previous = runs[index - 1];
      const current = runs[index];
      const next = runs[index + 1];
      const exceptionCount = current.end - current.start + 1;
      const regularCount = previous.end - previous.start + 1 + (next.end - next.start + 1);
      if (
        previous.signature !== next.signature ||
        !exceptionsWithinThreshold(regularCount, exceptionCount)
      ) {
        continue;
      }
      for (let occurrence = current.start; occurrence <= current.end; occurrence += 1) {
        resolved[occurrence] = previous.signature;
      }
      changed = true;
      break;
    }
  }
  return resolved;
}

function signatureRuns(signatures: readonly string[]): SignatureRun[] {
  const runs: SignatureRun[] = [];
  signatures.forEach((signature, index) => {
    const current = runs.at(-1);
    if (current?.signature === signature) {
      current.end = index;
    } else {
      runs.push({ start: index, end: index, signature });
    }
  });
  return runs;
}

function nearestStableSignature(
  index: number,
  affinitySignature: string,
  affinitySignatures: readonly string[],
  previous: SignatureRun | undefined,
  next: SignatureRun | undefined,
) {
  if (!previous) {
    return next?.signature;
  }
  if (!next) {
    return previous.signature;
  }

  const matchesPrevious = affinitySignatures[previous.end] === affinitySignature;
  const matchesNext = affinitySignatures[next.start] === affinitySignature;
  if (matchesPrevious !== matchesNext) {
    return matchesPrevious ? previous.signature : next.signature;
  }

  return index - previous.end <= next.start - index ? previous.signature : next.signature;
}

function transitionEvents(occurrences: readonly TimetableOccurrence[]): TransitionEvent[] {
  const byWeekday = Map.groupBy(occurrences, (occurrence) => occurrence.weekday);
  return [...byWeekday]
    .flatMap(([weekday, weekdayOccurrences]) => {
      const events: TransitionEvent[] = [];
      for (let index = 1; index < weekdayOccurrences.length; index += 1) {
        const current = weekdayOccurrences[index];
        const previous = weekdayOccurrences[index - 1];
        if (current.resolvedSignature === previous.resolvedSignature) {
          continue;
        }
        const firstMatching = weekdayOccurrences
          .slice(index)
          .find((occurrence) => occurrence.rawSignature === current.resolvedSignature);
        const date = current.affinityMatchesResolved
          ? current.day.date
          : (firstMatching?.day.date ?? current.day.date);
        events.push({ date, weekday });
      }
      return events;
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}

function mergeNearbyTransitions(events: readonly TransitionEvent[]) {
  const clusters: TransitionEvent[][] = [];
  for (const event of events) {
    const cluster = clusters.at(-1);
    const lastEvent = cluster?.at(-1);
    if (cluster && lastEvent && daysBetween(lastEvent.date, event.date) <= nearbyTransitionDays) {
      cluster.push(event);
    } else {
      clusters.push([event]);
    }
  }
  return clusters.map((cluster) => cluster[0].date);
}

function timetableSignature(day: JourneyDay, data: FlightReferenceData) {
  return day.legs
    .map((item) => {
      const variant = displayVariantFor(data, item);
      if (!variant) {
        return `${item.departureAirportId}|unpublished`;
      }
      const arrival = localArrivalSchedule(item.departureDateLocal, variant);
      if (!arrival) {
        return `${item.departureAirportId}|unpublished`;
      }
      return [
        item.departureAirportId,
        variant.departureTimeLocal,
        variant.arrivalAirportId,
        arrival.time,
        arrival.dayDelta,
        variant.durationSeconds,
        variant.serviceType,
      ].join('|');
    })
    .join('>>');
}

function timetableAffinitySignature(day: JourneyDay, data: FlightReferenceData) {
  // Local arrival time can shift during the gap between origin and destination DST changes.
  return day.legs
    .map((item) => {
      const variant = displayVariantFor(data, item);
      if (!variant) {
        return `${item.departureAirportId}|unpublished`;
      }
      return [
        item.departureAirportId,
        variant.departureTimeLocal,
        variant.arrivalAirportId,
        variant.durationSeconds,
        variant.serviceType,
      ].join('|');
    })
    .join('>>');
}

function exactVariantSignature(day: JourneyDay) {
  return day.legs
    .map((item) => `${item.departureAirportId}|${currentVariantId(item) ?? 'cancelled'}`)
    .join('>>');
}

function mode(values: readonly string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))[0];
}

function exceptionsWithinThreshold(regularDateCount: number, exceptionDateCount: number) {
  return regularDateCount > 0 && exceptionDateCount * 2 <= regularDateCount;
}

function currentVariantId(item: FlightScheduleItem) {
  return item.flightVariantId;
}

function compareWeekdays(left: number, right: number) {
  const values: readonly number[] = weekdayOrder;
  return values.indexOf(left) - values.indexOf(right);
}

function weekdayOf(date: string) {
  return weekdayForDate(date);
}

function previousDate(date: string) {
  return addDays(date, -1);
}
