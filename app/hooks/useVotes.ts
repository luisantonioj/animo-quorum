// app/hooks/useVotes.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../utils/supabase';

// POST /votes — server-authoritative via RPC (never write Votes directly)
export function useCastVote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      candidateId,
      positionId,
    }: {
      candidateId: string;
      positionId: string;
    }) => {
      const { data, error } = await supabase.rpc('cast_vote', {
        p_candidate_id: candidateId,
        p_position_id:  positionId,
      });
      
      if (error) throw error;
      
      const result = data as { success: boolean; error?: string } | null;
      if (result && !result.success) throw new Error(result.error || 'Failed to cast vote');
      
      return result;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['votes', 'tally'] }),
  });
}

// GET /votes/tally — admin: full vote counts
export function useVoteTally(cycleId?: string | null) {
  return useQuery({
    queryKey: ['votes', 'tally', cycleId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_vote_tally', {
        p_cycle_id: cycleId ?? undefined,
      });
      
      if (error) throw error;
      if (!data) return []; 
      
      return data;
    },
  });
}

// GET /votes/live — students: anonymous percentages only
// Uses polling (refetchInterval) instead of Realtime to stay under the
// 200 concurrent connection free-tier limit
export function useLiveResults(cycleId?: string | null) {
  return useQuery({
    queryKey: ['votes', 'live', cycleId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_live_results', {
        p_cycle_id: cycleId ?? undefined,
      });
      
      if (error) throw error;
      if (!data) return []; 
      
      return data;
    },
    refetchInterval: 10_000, // poll every 10 seconds
    staleTime: 0,
  });
}

// PATCH /votes/:id/invalidate — admin only
export function useInvalidateVote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (voteId: string) => {
      const { data, error } = await supabase.rpc('invalidate_vote', {
        p_vote_id: voteId,
      });
      
      if (error) throw error;
      
      const result = data as { success: boolean; error?: string } | null;
      if (result && !result.success) throw new Error(result.error || 'Failed to invalidate vote');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['votes', 'tally'] }),
  });
}
