import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  parseWriterOutput,
  stripDashes,
  validateWriterRequest,
} from '../supabase/functions/_shared/writer-prompt';

describe('AI writer prompt', () => {
  it('explicitly forbids em dashes and asks for a sincere human voice', () => {
    expect(SYSTEM_PROMPT).toMatch(/Never use an em dash/);
    expect(SYSTEM_PROMPT).toMatch(/sincere/);
    expect(SYSTEM_PROMPT).toMatch(/Never invent/);
    expect(SYSTEM_PROMPT).not.toMatch(/[\u2013\u2014]/);
  });

  it('builds an email prompt with mood, recipient and sender', () => {
    const p = buildUserPrompt({ notes: 'promo stock 14 units', context: 'email', mood: 'Urgent', recipient: 'Dave', senderName: 'Sarah', storeName: 'Reading - O2' });
    expect(p).toContain('Subject: ');
    expect(p).toContain('Mood: Urgent.');
    expect(p).toContain('Address it to: Dave');
    expect(p).toContain('Sign it off as: Sarah');
    expect(p).toContain('Store: Reading - O2');
    expect(p).toContain('<rough_notes>\npromo stock 14 units\n</rough_notes>');
  });

  it('builds a note prompt', () => {
    const p = buildUserPrompt({ notes: 'x', context: 'note', mood: 'Friendly' });
    expect(p).toContain('work note');
    expect(p).not.toContain('Subject:');
  });
});

describe('dash stripping', () => {
  it('removes em and en dashes in every position', () => {
    expect(stripDashes('Stock is low \u2014 please reorder')).toBe('Stock is low, please reorder');
    expect(stripDashes('Order 10\u201312 units')).toBe('Order 10-12 units');
    expect(stripDashes('\u2014 first item\n\u2013 second')).toBe('- first item\n- second');
    expect(stripDashes('Thanks \u2014')).toBe('Thanks');
    expect(stripDashes('a\u2014b')).toBe('a, b');
  });

  it('parses an email subject and strips dashes from the result', () => {
    const r = parseWriterOutput('Subject: Display fix \u2014 today\n\nHi Dave,\n\nAll done \u2014 thanks.', 'email');
    expect(r.subject).toBe('Display fix, today');
    expect(r.body).toBe('Hi Dave,\n\nAll done, thanks.');
    expect(parseWriterOutput('Just a note', 'note')).toEqual({ subject: null, body: 'Just a note' });
  });
});

describe('request validation', () => {
  it('accepts a valid request', () => {
    expect(validateWriterRequest({ notes: ' hi ', context: 'note', mood: 'Stern', recipient: '' })).toEqual({
      notes: 'hi', context: 'note', mood: 'Stern', storeName: null, recipient: null, senderName: null,
    });
  });
  it.each([
    [{}, /notes/i],
    [{ notes: 'x', context: 'sms', mood: 'Stern' }, /Context/],
    [{ notes: 'x', context: 'note', mood: 'Angry' }, /Mood/],
    [{ notes: 'x'.repeat(7000), context: 'note', mood: 'Stern' }, /too long/],
  ])('rejects %#', (body, msg) => expect(() => validateWriterRequest(body)).toThrow(msg));
});
