import { buildAxis, describeReleaseMarker, placeSpan, releaseMarkers } from '@/features/planning/lib/roadmap';

const TODAY = new Date(2030, 0, 10);

describe('releaseMarkers', () => {
  it('places dated, non-archived releases on the axis in date order', () => {
    const axis = buildAxis([{ start: '2030-01-05', end: '2030-03-20' }], 'months', TODAY);
    const markers = releaseMarkers([
      { _id: 'b', name: 'v2', status: 'unreleased', releaseDate: '2030-03-01T00:00:00.000Z' },
      { _id: 'a', name: 'v1', status: 'released', releaseDate: '2030-02-01' },
      { _id: 'c', name: 'old', status: 'archived', releaseDate: '2030-02-10' },
      { _id: 'd', name: 'undated', status: 'unreleased', releaseDate: null },
    ], axis);

    expect(markers.map(marker => marker.id)).toEqual(['a', 'b']);
    expect(markers[0].left).toBe(placeSpan({ start: '2030-02-01', end: '2030-02-01' }, axis).left + axis.dayPx / 2);
    expect(markers[0].left).toBeLessThan(markers[1].left);
  });

  it('describes a marker for screen readers', () => {
    expect(describeReleaseMarker({ name: 'v1.2.0', status: 'unreleased', date: '2030-03-05' })).toBe('Release v1.2.0, due Mar 5, 2030');
    expect(describeReleaseMarker({ name: 'v1.1.0', status: 'released', date: '2030-02-01' })).toBe('Release v1.1.0, released Feb 1, 2030');
  });
});
