import { supabase } from '@/lib/supabaseClient';

export interface TeamOrder {
  id: string;
  created_by: string;
  title: string;
  place: string | null;
  status: 'open' | 'closed';
  created_at: string;
  closed_at: string | null;
}

export interface TeamOrderItem {
  id: string;
  order_id: string;
  user_id: string;
  item: string;
  note: string | null;
  created_at: string;
}

/** The open group order, or null if nobody has started one. */
export async function fetchOpenOrder(): Promise<TeamOrder | null> {
  const { data, error } = await supabase
    .from('team_orders')
    .select('id,created_by,title,place,status,created_at,closed_at')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as TeamOrder) ?? null;
}

export async function fetchOrderItems(orderId: string): Promise<TeamOrderItem[]> {
  const { data, error } = await supabase
    .from('team_order_items')
    .select('id,order_id,user_id,item,note,created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TeamOrderItem[];
}

export async function startOrder(title: string, place: string | null): Promise<TeamOrder> {
  const { data, error } = await supabase
    .from('team_orders')
    .insert({ title: title.trim() || 'Lunch', place: place?.trim() || null })
    .select('id,created_by,title,place,status,created_at,closed_at')
    .single();
  if (error) throw error;
  return data as TeamOrder;
}

export async function addOrderItem(orderId: string, item: string, note: string | null): Promise<TeamOrderItem> {
  const { data, error } = await supabase
    .from('team_order_items')
    .insert({ order_id: orderId, item: item.trim(), note: note?.trim() || null })
    .select('id,order_id,user_id,item,note,created_at')
    .single();
  if (error) {
    if (error.code === '42501') throw new Error('That order has closed.');
    throw error;
  }
  return data as TeamOrderItem;
}

export async function removeOrderItem(id: string): Promise<void> {
  const { error } = await supabase.from('team_order_items').delete().eq('id', id);
  if (error) throw error;
}

export async function closeOrder(id: string): Promise<void> {
  const { error } = await supabase.from('team_orders').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
