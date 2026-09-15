import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { scheduleLiveRefresh } from './refresh';
import { changePlaybackSpeed, simulatedTime, type PlaybackClock } from './playback';

export function useLiveFlights() {
  const [clock, setClock] = useState<PlaybackClock>(() => {
    const time = Date.now();
    return { time, wallTime: time, speed: 1 };
  });
  const [wallTime, setWallTime] = useState(clock.wallTime);
  const [request, setRequest] = useState(() => ({
    timestamp: new Date(clock.time).toISOString(),
    revision: 0,
  }));
  const query = useQuery({
    queryKey: ['live-flights', request.revision, request.timestamp],
    queryFn: ({ signal }) => api.liveFlights(request.timestamp, signal),
    // Keep aircraft during routine refreshes, but discard them on a manual time jump.
    placeholderData: (previous, previousQuery) => {
      if (previousQuery?.queryKey[1] === request.revision) {
        return previous;
      }
      return undefined;
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    gcTime: 0,
    retry: 2,
  });
  const { refetch } = query;
  const refresh = useCallback(() => {
    const timestamp = new Date(simulatedTime(clock, Date.now())).toISOString();
    if (timestamp === request.timestamp) {
      void refetch();
    } else {
      setRequest((previous) => ({ ...previous, timestamp }));
    }
  }, [clock, request.timestamp, refetch]);

  useEffect(() => {
    if (clock.speed === 0) {
      return;
    }
    const timer = setInterval(() => setWallTime(Date.now()), 250);
    return () => clearInterval(timer);
  }, [clock.speed]);
  useEffect(() => {
    if (!query.data || query.isPlaceholderData || query.isError) {
      return;
    }
    return scheduleLiveRefresh(
      query.data.nextDepartureTime,
      { speed: clock.speed, now: () => simulatedTime(clock, Date.now()) },
      (timestamp) => {
        setRequest((previous) => {
          if (previous.revision !== request.revision) {
            return previous;
          }
          return { ...previous, timestamp };
        });
      },
    );
  }, [query.data, query.isPlaceholderData, query.isError, clock, request.revision]);
  useEffect(() => {
    function catchUp() {
      if (document.visibilityState === 'visible') {
        setWallTime(Date.now());
        refresh();
      }
    }
    document.addEventListener('visibilitychange', catchUp);
    window.addEventListener('online', catchUp);
    return () => {
      document.removeEventListener('visibilitychange', catchUp);
      window.removeEventListener('online', catchUp);
    };
  }, [refresh]);
  useEffect(() => {
    if (!query.isError) {
      return;
    }
    const timer = setTimeout(refresh, 15_000);
    return () => clearTimeout(timer);
  }, [query.isError, refresh]);

  function seek(time: number, speed = clock.speed) {
    const wallTime = Date.now();
    setWallTime(wallTime);
    setClock({ time, wallTime, speed });
    setRequest((previous) => ({
      timestamp: new Date(time).toISOString(),
      revision: previous.revision + 1,
    }));
  }
  function setSpeed(speed: number) {
    const wallTime = Date.now();
    setWallTime(wallTime);
    setClock((previous) => changePlaybackSpeed(previous, speed, wallTime));
  }
  return {
    ...query,
    now: simulatedTime(clock, wallTime),
    speed: clock.speed,
    seek,
    setSpeed,
    goLive: () => seek(Date.now(), 1),
  };
}
