// hooks/useSettings.ts
import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../utils/supabase';
import type { Database } from '../utils/database.types';
import { useAuthStore } from '../stores/authStore';

// =============================================================================
// TYPES
// =============================================================================

type ElectionCycleRow =
  Database['public']['Tables']['ElectionCycles']['Row'];

type ElectionCycleSettingsUpdate = Pick<
  Database['public']['Tables']['ElectionCycles']['Update'],
  'voting_start_time' | 'voting_end_time' | 'is_miting_active' | 'show_live_results'
>;

export type VotingStatus =
  | 'not_started'
  | 'active'
  | 'ended'
  | 'unconfigured';

// =============================================================================
// SINGLETON SUBSCRIPTION
// One shared channel regardless of how many components call useSettings().
// Reference-counted: channel opens on first subscriber, closes on last.
// =============================================================================

let subscriberCount = 0;
let channel: ReturnType<typeof supabase.channel> | null = null;
const invalidateCallbacks = new Set<() => void>();

function registerSettingsSubscriber(onInvalidate: () => void) {
  invalidateCallbacks.add(onInvalidate);
  subscriberCount += 1;

  if (subscriberCount === 1) {
    // First subscriber — open the channel
    channel = supabase
      .channel('election-cycle-settings-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ElectionCycles' },
        () => {
          invalidateCallbacks.forEach(cb => cb());
        }
      )
      .subscribe();
  }

  return () => {
    invalidateCallbacks.delete(onInvalidate);
    subscriberCount -= 1;

    if (subscriberCount === 0 && channel) {
      // Last subscriber — close the channel
      supabase.removeChannel(channel);
      channel = null;
    }
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function getVotingStatus(settings: ElectionCycleRow | null): VotingStatus {
  if (!settings?.voting_start_time || !settings?.voting_end_time)
    return 'unconfigured';

  const now   = Date.now();
  const start = new Date(settings.voting_start_time).getTime();
  const end   = new Date(settings.voting_end_time).getTime();

  if (now < start) return 'not_started';
  if (now > end)   return 'ended';
  return 'active';
}

// =============================================================================
// HOOK: GET SETTINGS (WITH REALTIME)
// =============================================================================

export function useSettings() {
  const queryClient = useQueryClient();
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;
  const activeCycleId = useAuthStore((state) => state.activeCycleId);

  const query = useQuery<ElectionCycleRow | null>({
    queryKey: ['settings', activeCycleId],
    queryFn: async () => {
      if (!activeCycleId) return null;

      const { data, error } = await supabase
        .from('ElectionCycles')
        .select('*')
        .eq('id', activeCycleId)
        .maybeSingle();

      if (error) throw error;
      return data ?? null;
    },
    refetchInterval: 60_000,
  });

  // Register with the singleton — safe to call from multiple components
  useEffect(() => {
    const unregister = registerSettingsSubscriber(() => {
      queryClientRef.current.invalidateQueries({ queryKey: ['settings'] });
    });
    return unregister;
  }, []); // empty — singleton manages the actual channel lifecycle

  const votingStatus = useMemo(
    () => getVotingStatus(query.data ?? null),
    [query.data]
  );

  return {
    settings:  query.data ?? null,
    votingStatus,
    isLoading: query.isLoading,
    isError:   query.isError,
    error:     query.error as Error | null,
  };
}

// =============================================================================
// HOOK: UPDATE SETTINGS
// =============================================================================

export function useUpdateSettings() {
  const qc = useQueryClient();
  const activeCycleId = useAuthStore((state) => state.activeCycleId);

  return useMutation({
    mutationFn: async (updates: ElectionCycleSettingsUpdate) => {
      if (!activeCycleId) throw new Error('No active election cycle is available.');

      const { error } = await supabase
        .from('ElectionCycles')
        .update(updates)
        .eq('id', activeCycleId);

      if (error) throw error;
    },

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['active-cycle'] });
    },
  });
}
