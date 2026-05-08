import { describe, expect, test } from 'vitest';

import {
  ANALYTICS_WINDOW_OPTIONS,
  buildAnalyticsChartPoints,
  clampAnalyticsWindowDays,
  DEFAULT_ANALYTICS_WINDOW_DAYS,
  ensureMinimumChartPoints,
  getAvailableAnalyticsWindowOptions,
} from './analytics.utils';

describe('analytics.utils', () => {
  test('clampAnalyticsWindowDays returns default for unsupported values', () => {
    expect(clampAnalyticsWindowDays(28)).toBe(28);
    expect(clampAnalyticsWindowDays(15)).toBe(DEFAULT_ANALYTICS_WINDOW_DAYS);
  });

  test('getAvailableAnalyticsWindowOptions keeps all options visible', () => {
    expect(getAvailableAnalyticsWindowOptions()).toEqual([
      ...ANALYTICS_WINDOW_OPTIONS,
    ]);
  });

  test('buildAnalyticsChartPoints sorts series by date and maps values', () => {
    const points = buildAnalyticsChartPoints([
      {
        date: '2026-02-12',
        totalViews: 4,
        uniqueViews: 2,
        guestViews: 1,
      },
      {
        date: '2026-02-10',
        totalViews: 9,
        uniqueViews: 3,
        guestViews: 0,
      },
    ]);

    expect(points).toEqual([
      {
        x: 0,
        date: '2026-02-10',
        totalViews: 9,
        uniqueViews: 3,
        guestViews: 0,
      },
      {
        x: 1,
        date: '2026-02-12',
        totalViews: 4,
        uniqueViews: 2,
        guestViews: 1,
      },
    ]);
  });

  test('ensureMinimumChartPoints duplicates the only data point', () => {
    const points = ensureMinimumChartPoints([
      {
        x: 0,
        date: '2026-02-12',
        totalViews: 4,
        uniqueViews: 2,
        guestViews: 1,
      },
    ]);

    expect(points).toEqual([
      {
        x: 0,
        date: '2026-02-12',
        totalViews: 4,
        uniqueViews: 2,
        guestViews: 1,
      },
      {
        x: 1,
        date: '2026-02-12',
        totalViews: 4,
        uniqueViews: 2,
        guestViews: 1,
      },
    ]);
  });
});
