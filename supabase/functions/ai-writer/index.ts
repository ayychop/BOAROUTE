// ai-writer: rewrites rough notes into a polished note or email with Claude.
// Secrets: ANTHROPIC_API_KEY (supabase secrets set ANTHROPIC_API_KEY=...)
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { corsHeaders, json, requireUser } from '../_shared/http.ts';
import { SYSTEM_PROMPT, buildUserPrompt, parseWriterOutput, validateWriterRequest } from '../_shared/writer-prompt.ts';

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const userId = await requireUser(req);
  if (!userId) return json({ error: 'Please sign in again' }, 401);

  let request;
  try {
    request = validateWriterRequest(await req.json());
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Invalid request' }, 400);
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
      return json({ error: 'The AI could not write this one. Try rewording your notes.' }, 422);
    }

    const raw = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('\n')
      .trim();
    if (!raw) return json({ error: 'The AI returned an empty draft. Please try again.' }, 502);

    return json(parseWriterOutput(raw, request.context));
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return json({ error: 'The AI is busy right now. Try again in a minute.' }, 429);
    }
    if (error instanceof Anthropic.AuthenticationError) {
      console.error('ai-writer: ANTHROPIC_API_KEY is missing or invalid');
      return json({ error: 'The AI writer is not configured yet.' }, 503);
    }
    if (error instanceof Anthropic.APIError) {
      console.error('ai-writer: Anthropic API error', error.status, error.message);
      return json({ error: 'The AI writer hit a problem. Please try again.' }, 502);
    }
    console.error('ai-writer: unexpected error', error);
    return json({ error: 'Something went wrong drafting your message.' }, 500);
  }
});
