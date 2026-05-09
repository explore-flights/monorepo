import { UpdateReportItem } from '../../lib/api/api.model';
import React, { useEffect, useMemo, useState } from 'react';
import { Domain, LineSeries, SeriesBuilder } from '../../lib/charts/builder';
import { DateTime } from 'luxon';
import { DateRangePicker, FormField, LineChart, Slider } from '@cloudscape-design/components';

export function UpdateReportLineChart({ items, loading }: { items: ReadonlyArray<UpdateReportItem>, loading?: boolean }) {
  const [series, xDomain, yDomain] = useMemo(() => {
    const builder = new SeriesBuilder<string, LineSeries<Date>>(
      'line',
      (title, xDomain, yDomain) => ({
        title: title,
        xDomain,
        yDomain,
      }),
    );

    for (const item of items) {
      const date = DateTime.fromISO(item.version).toJSDate();
      builder.add('Added', date, item.added);
      builder.add('Removed', date, item.removed);
      builder.add('Updated', date, item.updated);
    }

    const [series, xDomain, yDomain] = builder.series(false, true);
    return [
      series,
      xDomain,
      yDomain,
    ] as const;
  }, [items]);

  const [activeXDomain, setActiveXDomain] = useState<Domain<Date>>([new Date(), new Date()]);
  useEffect(() => {
    if (xDomain) {
      setActiveXDomain(xDomain);
    }
  }, [xDomain]);

  const [yDomainEnd, setYDomainEnd] = useState(0);
  useEffect(() => {
    if (yDomain) {
      setYDomainEnd(yDomain[1]);
    }
  }, [yDomain]);

  return (
    <LineChart
      statusType={loading ? 'loading' : 'finished'}
      series={series}
      xDomain={activeXDomain}
      yDomain={[0, yDomainEnd]}
      xScaleType={'time'}
      xTitle={'Time'}
      yTitle={'Updates'}
      xTickFormatter={(e) => DateTime.fromJSDate(e).toISO() ?? ''}
      additionalFilters={[
        (
          <FormField key={'time_range'} label={'Time Range'}>
            <DateRangePicker
              absoluteFormat={'iso'}
              isValidRange={() => ({ valid: true })}
              relativeOptions={[]}
              rangeSelectorMode={'absolute-only'}
              showClearButton={false}
              value={{
                type: 'absolute',
                startDate: activeXDomain[0].toISOString(),
                endDate: activeXDomain[1].toISOString(),
              }}
              onChange={({ detail: { value }}) => {
                if (value && value.type === 'absolute') {
                  setActiveXDomain([new Date(value.startDate), new Date(value.endDate)]);
                }
              }}
            />
          </FormField>
        ),
        (
          <FormField key={'scale_limit'} label={'Scale Limit'} stretch={true}>
            <Slider
              min={0}
              max={yDomain ? yDomain[1] : 0}
              value={yDomainEnd}
              onChange={({ detail: { value }}) => setYDomainEnd(value)}
            />
          </FormField>
        ),
      ]}
    />
  );
}