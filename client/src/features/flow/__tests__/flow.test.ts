import {
  agingLevel, areaPath, axisScale, cfdMax, countOverP85, describeCfd, describeStats, formatDays, isEmptyReport, labelIndexes, rangeFor,
  shortDays, stackBands, totalThroughput,
} from '../lib/flow';
import { aging, cfdDay, emptyFlowReport, makeFlowReport, point, stats } from './fixtures';

describe('rangeFor', () => {
  it('ends today and spans the requested number of UTC days', () => {
    expect(rangeFor(30, new Date('2026-10-10T23:30:00.000Z'))).toEqual({ from: '2026-09-11', to: '2026-10-10' });
    expect(rangeFor(1, new Date('2026-10-10T00:00:00.000Z'))).toEqual({ from: '2026-10-10', to: '2026-10-10' });
    expect(rangeFor(14, new Date('2026-03-05T12:00:00.000Z'))).toEqual({ from: '2026-02-20', to: '2026-03-05' });
  });
});

describe('formatDays', () => {
  it('rounds to one decimal and pluralises', () => {
    expect(formatDays(1)).toBe('1 day');
    expect(formatDays(3.46)).toBe('3.5 days');
    expect(formatDays(0)).toBe('0 days');
    expect(formatDays(null)).toBe('–');
    expect(shortDays(2.04)).toBe('2d');
    expect(shortDays(null)).toBe('–');
  });
});

describe('axisScale', () => {
  it('rounds the top up to a tidy step', () => {
    expect(axisScale(0)).toEqual({ max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] });
    expect(axisScale(7)).toMatchObject({ max: 8, ticks: [0, 2, 4, 6, 8] });
    expect(axisScale(23)).toMatchObject({ max: 30, ticks: [0, 10, 20, 30] });
    expect(axisScale(100).ticks).toEqual([0, 25, 50, 75, 100]);
  });
});

describe('stackBands', () => {
  const cfd = [cfdDay('a', 3, 1, 0), cfdDay('b', 1, 2, 4)];

  it('stacks completed first, then in progress, then pending', () => {
    const bands = stackBands(cfd);
    expect(bands.map(band => band.status)).toEqual(['completed', 'inProgress', 'pending']);
    expect(bands[0]).toMatchObject({ lower: [0, 0], upper: [0, 4] });
    expect(bands[1]).toMatchObject({ lower: [0, 4], upper: [1, 6] });
    expect(bands[2]).toMatchObject({ lower: [1, 6], upper: [4, 7] });
    expect(cfdMax(cfd)).toBe(7);
  });

  it('closes an area path along the upper edge and back along the lower edge', () => {
    expect(areaPath([0, 10], [5, 4], [8, 8])).toBe('M0.0 5.0 L10.0 4.0 L10.0 8.0 L0.0 8.0 Z');
    expect(areaPath([], [], [])).toBe('');
  });
});

describe('labelIndexes', () => {
  it('keeps the first and last item and spreads the rest', () => {
    expect(labelIndexes(3, 5)).toEqual([0, 1, 2]);
    expect(labelIndexes(30, 5)).toEqual([0, 7, 15, 22, 29]);
    expect(labelIndexes(0)).toEqual([]);
  });
});

describe('agingLevel', () => {
  it('compares days in progress with the 85th percentile', () => {
    expect(agingLevel(2, 10)).toBe('ok');
    expect(agingLevel(5, 10)).toBe('ok');
    expect(agingLevel(6, 10)).toBe('watch');
    expect(agingLevel(10, 10)).toBe('watch');
    expect(agingLevel(10.1, 10)).toBe('over');
  });

  it('cannot judge without a baseline', () => {
    expect(agingLevel(40, null)).toBe('unknown');
    expect(agingLevel(40, 0)).toBe('unknown');
  });

  it('counts the tasks over the baseline', () => {
    expect(countOverP85([aging('a', 12), aging('b', 3), aging('c', 30)], 10)).toBe(2);
    expect(countOverP85([aging('a', 12)], null)).toBe(0);
  });
});

describe('report helpers', () => {
  it('detects a report with nothing in it', () => {
    expect(isEmptyReport(emptyFlowReport())).toBe(true);
    expect(isEmptyReport(makeFlowReport())).toBe(false);
    expect(isEmptyReport({ ...emptyFlowReport(), aging: [aging('a', 1)] })).toBe(false);
  });

  it('adds up the completed work of all weeks', () => {
    expect(totalThroughput(makeFlowReport())).toBe(3);
  });

  it('describes the charts in words', () => {
    expect(describeCfd(makeFlowReport().cfd)).toBe(
      'Cumulative flow from 2026-10-01 to 2026-10-07. On the last day 0 pending, 2 in progress and 1 completed.',
    );
    expect(describeCfd([])).toBe('Cumulative flow: no data.');
    expect(describeStats('Cycle time', stats([point('1', 2), point('2', 4)], { p50: 2, p85: 4, p95: 4 })))
      .toBe('Cycle time scatter plot of 2 completed tasks. Median 2 days, 85th percentile 4 days, 95th percentile 4 days.');
    expect(describeStats('Lead time', stats([]))).toBe('Lead time scatter plot: no completed tasks in this range.');
  });
});
