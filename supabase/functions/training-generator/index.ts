// training-generator: writes three Daily Samsung IQ questions from the specs
// the admin types, and saves them unapproved for review in Training Center.
// Secrets: ANTHROPIC_API_KEY (the same one the ai-writer uses).
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { corsHeaders, json } from '../_shared/http.ts';
import { TRAINING_OUTPUT_SCHEMA, TRAINING_SYSTEM_PROMPT, buildTrainingPrompt, parseTrainingOutput, validateSpecs } from '../_shared/training-prompt.ts';

let client: Anthropic | null = null;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed', code: 'method_not_allowed' }, 405);

  // Act as the signed-in admin, so RLS decides what may be written.
  const authHeader = req.headers.get('Authorization');
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!authHeader || !url || !anonKey) return json({ error: 'Please sign in again', code: 'unauthorized' }, 401);
  const supabase = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return json({ error: 'Please sign in again', code: 'unauthorized' }, 401);
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (isAdmin !== true) return json({ error: 'Only the admin can generate training questions.', code: 'forbidden' }, 403);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.error('training-generator: ANTHROPIC_API_KEY secret is not set (supabase secrets set ANTHROPIC_API_KEY=...)');
    return json({ error: 'AI generation is not configured: the ANTHROPIC_API_KEY secret is not set on the server.', code: 'missing_api_key' }, 503);
  }
  client ??= new Anthropic({ apiKey });

  let specs: string;
  try {
    specs = validateSpecs(await req.json());
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Invalid request', code: 'bad_request' }, 400);
  }

  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: TRAINING_OUTPUT_SCHEMA } },
      system: TRAINING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildTrainingPrompt(specs) }],
    });

    if (response.stop_reason === 'refusal') {
      return json({ error: 'The AI could not write questions from these specs. Try rewording them.', code: 'refusal' }, 422);
    }
    const raw = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();
    const drafts = parseTrainingOutput(raw);
    if (drafts.length === 0) return json({ error: 'The AI returned no usable questions. Please try again.', code: 'empty' }, 502);

    const { data: saved, error: saveError } = await supabase
      .from('training_questions')
      .insert(drafts.map((d) => ({ ...d, is_approved: false, is_active: true })))
      .select('*');
    if (saveError) {
      console.error('training-generator: save failed', saveError.message);
      // A repeat of an existing question trips the unique index.
      const repeat = saveError.code === '23505';
      return json({ error: repeat ? 'The AI repeated a question you already have. Try again or add more detail to the specs.' : 'Could not save the new questions.', code: repeat ? 'duplicate' : 'save_failed', detail: saveError.message }, repeat ? 409 : 500);
    }
    return json({ questions: saved });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return json({ error: 'The AI is busy right now. Try again in a minute.', code: 'rate_limited' }, 429);
    }
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      console.error('training-generator: ANTHROPIC_API_KEY was rejected', error.status);
      return json({ error: 'AI generation is not configured: the ANTHROPIC_API_KEY on the server was rejected.', code: 'invalid_api_key' }, 503);
    }
    if (error instanceof Anthropic.APIError) {
      console.error('training-generator: Anthropic API error', error.status, error.message);
      return json({ error: 'The AI hit a problem. Please try again.', code: 'upstream_error', detail: `Anthropic ${error.status ?? ''} ${error.message}`.trim() }, 502);
    }
    console.error('training-generator: unexpected error', error);
    return json({ error: 'Something went wrong generating questions.', code: 'internal', detail: error instanceof Error ? error.message : String(error) }, 500);
  }
});
