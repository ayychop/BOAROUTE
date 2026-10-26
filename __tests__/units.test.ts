import { formatDistance, formatMilesIn, formatNavDistance, spokenDistance, toMiles, unitFor } from '../src/lib/units';

describe('distance units', () => {
  it('defaults to miles for UK users', () => {
    expect(unitFor(null)).toBe('mi');
    expect(unitFor({ distance_unit: null })).toBe('mi');
    expect(unitFor({ distance_unit: 'km' })).toBe('km');
  });

  it('formats route distances in the chosen unit', () => {
    expect(formatDistance(16.2, 'mi')).toBe('10 mi');
    expect(formatDistance(8, 'mi')).toBe('5.0 mi');
    expect(formatDistance(8, 'km')).toBe('8.0 km');
    expect(formatDistance(42.4, 'km')).toBe('42 km');
  });

  it('turn-by-turn: yards and miles, or metres and kilometres', () => {
    expect(formatNavDistance(200, 'mi')).toBe('220 yd');
    expect(formatNavDistance(2000, 'mi')).toBe('1.2 mi');
    expect(formatNavDistance(20, 'km')).toBe('now');
    expect(formatNavDistance(240, 'km')).toBe('240 m');
    expect(formatNavDistance(640, 'km')).toBe('650 m');
    expect(formatNavDistance(2000, 'km')).toBe('2.0 km');
  });

  it('speaks units in full', () => {
    expect(spokenDistance('220 yd')).toBe('220 yards');
    expect(spokenDistance('1.2 mi')).toBe('1.2 miles');
    expect(spokenDistance('650 m')).toBe('650 metres');
    expect(spokenDistance('2.0 km')).toBe('2.0 kilometres');
  });

  it('shows stored miles in km and converts typed km back to miles', () => {
    expect(formatMilesIn(10, 'km')).toBe('16.1 km');
    expect(formatMilesIn(10, 'mi')).toBe('10.0 mi');
    expect(toMiles(16.09344, 'km')).toBeCloseTo(10, 5);
    expect(toMiles(10, 'mi')).toBe(10);
  });
});
