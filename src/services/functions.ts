import { FunctionsHttpError } from '@supabase/supabase-js';
import type { RouteOptionsResult } from '../../supabase/functions/_shared/route-analysis';
import type { Mood, WriterContext, WriterResult } from '../../supabase/functions/_shared/writer-prompt';
import { estimateRouteOptions } from '@/lib/route-estimate';
import { supabase } from '@/lib/supabaseClient';
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

export async function draftMessage(req: {
  notes: string;
  context: WriterContext;
  mood: Mood;
  storeName?: string | null;
  recipient?: string | null;
  senderName?: string | null;
}): Promise<WriterResult> {
  const { data, error } = await supabase.functions.invoke<WriterResult>('ai-writer', { body: req });
  if (error) throw await functionError(error, 'The AI writer is unavailable right now. Check your connection and try again.');
  if (!data?.body) throw new Error('The AI returned an empty draft. Please try again.');
  return data;
}
