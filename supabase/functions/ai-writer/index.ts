import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
// Small HTTP helpers shared by the Edge Functions (Deno runtime).
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Returns the signed-in user's id, or null when the request is not authenticated. */
export async function requireUser(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) return null;
  const supabase = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}
// Prompt construction and output clean-up for the `ai-writer` Edge Function.
// Pure module: shared with the Jest suite, so no Deno or React Native imports.

export const MOODS = ['Professional', 'Urgent', 'Friendly', 'Stern'] as const;
export type Mood = (typeof MOODS)[number];

export const CONTEXTS = ['note', 'email'] as const;
export type WriterContext = (typeof CONTEXTS)[number];

export interface WriterRequest {
  notes: string;
  context: WriterContext;
  mood: Mood;
  storeName?: string | null;
  recipient?: string | null;
  senderName?: string | null;
}

export const MAX_NOTES_CHARS = 6000;

const MOOD_GUIDE: Record<Mood, string> = {
  Professional: 'Calm, clear and courteous. Confident without being stiff.',
  Urgent: 'Make the time pressure and the action needed obvious in the first two sentences. Stay polite and composed, never panicked.',
  Friendly: 'Warm and personable, like a colleague who gets on well with the reader. Still clear about any facts and actions.',
  Stern: 'Firm and direct about what is wrong and what must change, with a clear deadline if the notes give one. Respectful, never rude, sarcastic or threatening.',
};

export const SYSTEM_PROMPT = [
  'You turn rough field notes from a retail merchandiser into finished writing they can send or file straight away.',
  '',
  'Voice:',
  '- Sound like a sincere, capable person writing in their own words. Plain British English.',
  '- No corporate filler or stock phrases (for example "I hope this email finds you well", "please do not hesitate", "going forward", "circle back").',
  '- No emojis, no hashtags, no exclamation marks unless the mood is Friendly, and then at most one.',
  '',
  'Punctuation rule (strict):',
  '- Never use an em dash or an en dash anywhere in your output. Not as a pause, not in lists, not in ranges.',
  '- Use commas, full stops, colons or brackets instead. For number ranges write "10 to 12" or "10-12" with a plain hyphen.',
  '',
  'Accuracy:',
  '- Keep every fact, number, product, store, date and name from the notes exactly as given.',
  '- Never invent details, promises, figures or names. If something in the notes is unclear, leave it out rather than guess.',
  '',
  'Output:',
  '- Return only the finished text. No preamble, no explanation, no markdown headings.',
].join('\n');

export function buildUserPrompt(req: WriterRequest): string {
  const lines: string[] = [];
  if (req.context === 'email') {
    lines.push('Write an email.');
    lines.push('Format: the first line is "Subject: " followed by a short, specific subject. Then a blank line, then the email body with a greeting and a sign-off.');
    if (req.recipient) lines.push(`Address it to: ${req.recipient}`);
    lines.push(req.senderName ? `Sign it off as: ${req.senderName}` : 'Sign it off with a simple "Thanks" and no name.');
  } else {
    lines.push('Write a tidy work note for my own records.');
    lines.push('Format: a short first line that works as a title, then the note. Use short bullet points with "- " for counts, stock levels and actions.');
  }
  lines.push(`Mood: ${req.mood}. ${MOOD_GUIDE[req.mood]}`);
  if (req.storeName) lines.push(`Store: ${req.storeName}`);
  lines.push('');
  lines.push('<rough_notes>');
  lines.push(req.notes.trim());
  lines.push('</rough_notes>');
  return lines.join('\n');
}

/** Replaces any em or en dash that slipped through with plain punctuation. */
export function stripDashes(text: string): string {
  return text
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, '$1-$2') // number ranges become a plain hyphen
    .replace(/\s*[\u2014\u2013]\s*$/gm, '') // dangling dash at end of a line
    .replace(/^\s*[\u2014\u2013]\s*/gm, '- ') // dash used as a bullet
    .replace(/\s*[\u2014\u2013]\s*/g, ', ') // dash used as a pause
    .replace(/,\s*,/g, ',')
    .replace(/ ,/g, ',');
}

export interface WriterResult {
  subject: string | null;
  body: string;
}

/** Splits the "Subject:" line off an email draft. */
export function parseWriterOutput(raw: string, context: WriterContext): WriterResult {
  const text = stripDashes(raw).trim();
  if (context !== 'email') return { subject: null, body: text };
  const match = text.match(/^\s*subject:\s*(.+)\n+([\s\S]*)$/i);
  if (!match) return { subject: null, body: text };
  return { subject: match[1].trim(), body: match[2].trim() };
}

export function validateWriterRequest(input: unknown): WriterRequest {
  if (!input || typeof input !== 'object') throw new Error('Request body must be a JSON object');
  const body = input as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  if (!notes) throw new Error('Add some notes for the AI to work from');
  if (notes.length > MAX_NOTES_CHARS) throw new Error(`Notes are too long (max ${MAX_NOTES_CHARS} characters)`);
  if (!CONTEXTS.includes(body.context as WriterContext)) throw new Error('Context must be "note" or "email"');
  if (!MOODS.includes(body.mood as Mood)) throw new Error('Mood must be Professional, Urgent, Friendly or Stern');
  const optional = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  return {
    notes,
    context: body.context as WriterContext,
    mood: body.mood as Mood,
    storeName: optional(body.storeName, 200),
    recipient: optional(body.recipient, 200),
    senderName: optional(body.senderName, 100),
  };
}

//ai-writer: rewrites rough notes into a polished note or email with Claude.
// Secrets: ANTHROPIC_API_KEY (supabase secrets set ANTHROPIC_API_KEY=...)


// Every error carries a `code` so the app can log exactly why a draft failed.
// The client is created per request, so a missing key is reported clearly
// instead of failing inside the SDK.
let client: Anthropic | null = null;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed', code: 'method_not_allowed' }, 405);

  const userId = await requireUser(req);
  if (!userId) return json({ error: 'Please sign in again', code: 'unauthorized' }, 401);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.error('ai-writer: ANTHROPIC_API_KEY secret is not set (supabase secrets set ANTHROPIC_API_KEY=...)');
    return json({ error: 'The AI writer is not configured: the ANTHROPIC_API_KEY secret is not set on the server.', code: 'missing_api_key' }, 503);
  }
  client ??= new Anthropic({ apiKey });

  let request;
  try {
    request = validateWriterRequest(await req.json());
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Invalid request', code: 'bad_request' }, 400);
  }

  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(request) }],
    });

    if (response.stop_reason === 'refusal') {
      return json({ error: 'The AI could not write this one. Try rewording your notes.', code: 'refusal' }, 422);
    }

    const raw = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('\n')
      .trim();
    if (!raw) return json({ error: 'The AI returned an empty draft. Please try again.', code: 'empty_draft' }, 502);

    return json(parseWriterOutput(raw, request.context));
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return json({ error: 'The AI is busy right now. Try again in a minute.', code: 'rate_limited' }, 429);
    }
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      console.error('ai-writer: ANTHROPIC_API_KEY was rejected', error.status);
      return json({ error: 'The AI writer is not configured: the ANTHROPIC_API_KEY on the server was rejected.', code: 'invalid_api_key' }, 503);
    }
    if (error instanceof Anthropic.APIError) {
      console.error('ai-writer: Anthropic API error', error.status, error.message);
      return json({ error: 'The AI writer hit a problem. Please try again.', code: 'upstream_error', detail: `Anthropic ${error.status ?? ''} ${error.message}`.trim() }, 502);
    }
    console.error('ai-writer: unexpected error', error);
    return json({ error: 'Something went wrong drafting your message.', code: 'internal', detail: error instanceof Error ? error.message : String(error) }, 500);
  }
});
