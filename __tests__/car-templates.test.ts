import { MAX_CAR_ROWS, carTemplate, type CarContext, type CarNavState } from '../src/car/car-templates';

const base: CarNavState = {
  title: 'Tuesday route',
  instruction: 'Turn left onto High Street',
  distanceToNext: '300 m',
  arrival: '14:32',
  remaining: '25 min · 12.4 mi',
  stops: ['Currys Aylesbury', 'Argos Thame', 'Currys Oxford'],
  arrived: false,
  rerouting: false,
};

describe('Android Auto car screen', () => {
  it('prompts to start on the phone when there is no route', () => {
    const t = carTemplate(null);
    expect(t.type).toBe('ListTemplate');
    expect(t.items).toHaveLength(1);
    expect(t.items[0].title).toBe('No active route');
  });

  it('shows the next turn, arrival, then the stores in order', () => {
    const t = carTemplate(base);
    expect(t.title).toBe('Tuesday route');
    expect(t.items[0]).toEqual({ title: 'Turn left onto High Street', texts: ['300 m'] });
    expect(t.items[1]).toEqual({ title: 'Arrive 14:32', texts: ['25 min · 12.4 mi'] });
    expect(t.items.slice(2).map((r) => [r.title, r.texts?.[0]])).toEqual([
      ['Currys Aylesbury', 'Next'],
      ['Argos Thame', 'Stop 2'],
      ['Currys Oxford', 'Destination'],
    ]);
  });

  it('never goes over the driving row limit, folding the rest into one row', () => {
    const stops = Array.from({ length: 10 }, (_, i) => `Store ${i + 1}`);
    const t = carTemplate({ ...base, stops });
    expect(t.items).toHaveLength(MAX_CAR_ROWS);
    expect(t.items[2].title).toBe('Store 1');
    expect(t.items[MAX_CAR_ROWS - 1].title).toBe('+7 more stops');
    expect(t.items[MAX_CAR_ROWS - 1].texts).toEqual(['Ending at Store 10']);
  });

  it('shows rerouting without a stale distance', () => {
    expect(carTemplate({ ...base, rerouting: true }).items[0]).toEqual({ title: 'Rerouting…', texts: undefined });
  });

  it('falls back to the next store when there is no manoeuvre yet', () => {
    expect(carTemplate({ ...base, instruction: null, distanceToNext: null }).items[0].title).toBe('Continue to Currys Aylesbury');
  });

  it('says arrived at the destination', () => {
    const t = carTemplate({ ...base, arrived: true, stops: ['Currys Oxford'] });
    expect(t.items).toEqual([{ title: 'Arrived at Currys Oxford', texts: ['Route complete'] }]);
  });

  it('clips long store names so rows stay readable', () => {
    const t = carTemplate({ ...base, stops: ['A'.repeat(100)] });
    expect(t.items[2].title.length).toBeLessThanOrEqual(60);
    expect(t.items[2].title.endsWith('…')).toBe(true);
  });
});

describe('Android Auto upcoming stores and Start Visit', () => {
  const ctx: CarContext = {
    upcoming: [
      { id: 's1', name: 'Currys Aylesbury', detail: 'Grade A · 2 visits to go' },
      { id: 's2', name: 'Argos Thame', detail: 'Grade B · 1 visit to go' },
    ],
    storeIds: { 'Currys Aylesbury': 's1', 'Argos Thame': 's2' },
    visiting: null,
  };

  it('lists upcoming stores with Start Visit for the first when there is no route', () => {
    const t = carTemplate(null, ctx);
    expect(t.title).toBe('No active route');
    expect(t.items.map((r) => r.title)).toEqual(['Currys Aylesbury', 'Argos Thame']);
    expect(t.items[0].texts).toEqual(['Next · Grade A · 2 visits to go']);
    expect(t.actionStrip).toEqual([{ title: 'Start Visit', storeId: 's1' }]);
  });

  it('caps the idle list at the driving row limit', () => {
    const upcoming = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}`, name: `Store ${i}`, detail: 'Grade C · 1 visit to go' }));
    expect(carTemplate(null, { ...ctx, upcoming }).items).toHaveLength(MAX_CAR_ROWS);
  });

  it('offers Start Visit for the next stop while navigating', () => {
    expect(carTemplate(base, ctx).actionStrip).toEqual([{ title: 'Start Visit', storeId: 's1' }]);
  });

  it('has no Start Visit when the next stop is not a store', () => {
    expect(carTemplate({ ...base, stops: ['Home'] }, ctx).actionStrip).toBeUndefined();
  });

  it('shows the visit in progress instead of another Start Visit', () => {
    const idle = carTemplate(null, { ...ctx, visiting: 'Argos Thame' });
    expect(idle.items).toEqual([{ title: 'Visiting Argos Thame', texts: ['Complete the visit on your phone.'] }]);
    expect(idle.actionStrip).toBeUndefined();
    expect(carTemplate(base, { ...ctx, visiting: 'Argos Thame' }).actionStrip).toBeUndefined();
  });
});
