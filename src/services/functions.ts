import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import type { RouteOptionsResult } from '../../supabase/functions/_shared/route-analysis';
import type { Mood, WriterContext, WriterResult } from '../../supabase/functions/_shared/writer-prompt';
import type { TrainingQuestion } from '@/lib/training';
import { estimateRouteOptions } from '@/lib/route-estimate';
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient';
import type { LatLng } from '@/lib/types';

/** Turns an Edge Function failure into a human sentence. */
async function functionError(error: unknown, fallback: string): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body?.error) return new Error(String(body.error));
    } catch {
      // fall through
    }
  }
  return new Error(fallback);
}

export interface RouteOptionsResponse {
  result: RouteOptionsResult;
  /** Why live traffic was not used, when falling back to an estimate. */
  liveError: string | null;
}

/** Live traffic options via the route-options Edge Function, with an offline estimate fallback. */
export async function fetchRouteOptions(points: LatLng[]): Promise<RouteOptionsResponse> {
  try {
    const { data, error } = await supabase.functions.invoke<RouteOptionsResult>('route-options', { body: { points } });
    if (error) throw await functionError(error, 'Live traffic routing is unavailable right now.');
    if (!data?.standard || !data?.motorway) throw new Error('Live traffic routing returned no routes.');
    return { result: data, liveError: null };
  } catch (e) {
    return { result: estimateRouteOptions(points), liveError: e instanceof Error ? e.message : 'Live traffic unavailable' };
  }
}

/**
 * Why an Edge Function call failed, in detail, for the console and the screen.
 * Covers our own `{ error, code }` bodies, the Supabase gateway's
 * `{ code, message }` (404 not deployed, 401 bad JWT) and network failures.
 */
export async function describeFunctionError(name: string, error: unknown): Promise<{ status: number | null; code: string; message: string }> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const status = res?.status ?? null;
    let body: { error?: unknown; message?: unknown; msg?: unknown; code?: unknown; detail?: unknown } | null = null;
    try {
      body = await res.clone().json();
    } catch {
      body = null;
    }
    const serverMessage = String(body?.error ?? body?.message ?? body?.msg ?? '');
    const code = String(body?.code ?? `http_${status}`);
    console.log(`[${name}] HTTP ${status}`, { code, serverMessage, detail: body?.detail ?? null });
    if (status === 404) return { status, code, message: `The ${name} function is not deployed on this Supabase project (404). Deploy it with: npx supabase functions deploy ${name}` };
    if (status === 401) return { status, code, message: serverMessage && code !== 'unauthorized' ? `Not authorised (401): ${serverMessage}. Sign out and back in.` : 'Your session has expired (401). Sign out and back in, then try again.' };
    return { status, code, message: serverMessage || `The ${name} function failed (HTTP ${status}).` };
  }
  if (error instanceof FunctionsRelayError) {
    console.log(`[${name}] relay error`, error.message);
    return { status: null, code: 'relay_error', message: `Supabase could not reach the ${name} function (relay error). Try again in a moment.` };
  }
  if (error instanceof FunctionsFetchError) {
    console.log(`[${name}] network error`, error.message, error.context);
    return { status: null, code: 'network_error', message: 'No connection to the server. Check your signal and try again.' };
  }
  console.log(`[${name}] unexpected error`, error);
  return { status: null, code: 'unknown', message: error instanceof Error && error.message ? error.message : `The ${name} function failed.` };
}

export async function draftMessage(req: {
  notes: string;
  context: WriterContext;
  mood: Mood;
  storeName?: string | null;
  recipient?: string | null;
  senderName?: string | null;
}): Promise<WriterResult> {
  // Configuration first: a build without the Supabase URL and key can never reach the function.
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
  console.log('[ai-writer] invoking', { host: url.replace(/^https:\/\//, '').split('/')[0] || '(missing)', anonKeyPresent: key.length > 20, configured: isSupabaseConfigured, context: req.context, mood: req.mood, notesChars: req.notes.length });
  if (!isSupabaseConfigured) throw new Error('This build has no Supabase URL or anon key (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY). Add them to the EAS environment and rebuild.');

  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session) {
    console.log('[ai-writer] no session; the function requires a signed-in user');
    throw new Error('You are signed out. Sign in again to use the AI writer.');
  }

  const { data, error } = await supabase.functions.invoke<WriterResult>('ai-writer', { body: req });
  if (error) {
    const info = await describeFunctionError('ai-writer', error);
    throw new Error(info.message);
  }
  if (!data?.body) {
    console.log('[ai-writer] empty response', data);
    throw new Error('The AI returned an empty draft. Please try again.');
  }
  console.log('[ai-writer] ok', { chars: data.body.length, hasSubject: !!data.subject });
  return data;
}

/** Three new Daily Samsung IQ questions from the specs, saved unapproved for the admin to review. */
export async function generateTrainingQuestions(specs: string): Promise<TrainingQuestion[]> {
  if (!isSupabaseConfigured) throw new Error('This build has no Supabase URL or anon key. Add them to the EAS environment and rebuild.');
  const { data, error } = await supabase.functions.invoke<{ questions: TrainingQuestion[] }>('training-generator', { body: { specs } });
  if (error) {
    const info = await describeFunctionError('training-generator', error);
    throw new Error(info.message);
  }
  if (!data?.questions?.length) throw new Error('The AI returned no questions. Please try again.');
  return data.questions;
}
