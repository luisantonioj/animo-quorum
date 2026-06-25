import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../utils/supabase';
import { useAuthStore } from '../stores/authStore';

// GET /candidates — list (no credentials/platform — avoid large egress)
export function useCandidates() {
  const activeCycleId = useAuthStore(state => state.activeCycleId);

  return useQuery({
    queryKey: ['candidates', activeCycleId],
    queryFn: async () => {
      if (!activeCycleId) return [];

      const { data, error } = await supabase
        .from('Candidates')
        .select('id, name, partylist, position_id, photo_url, Positions(position_name)')
        .eq('election_cycle_id', activeCycleId)
        .order('position_id');
      if (error) throw error;
      if (!data) return [];

      return data;
    },
    enabled: !!activeCycleId,
    staleTime: Infinity,
  });
}

// GET /candidates/:id — full profile including credentials and platform
export function useCandidate(id: string) {
  return useQuery({
    queryKey: ['candidates', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('Candidates')
        .select('*, Positions(position_name)')
        .eq('id', id)
        .single();
      if (error) throw error;
      if (!data) throw new Error('Candidate not found');

      return data;
    },
    enabled: !!id,
  });
}

// DELETE /candidates/:id — admin only (uses RPC for atomic audit log)
export function useDeleteCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (candidateId: string) => {
      const { data, error } = await supabase.rpc('delete_candidate', {
        p_candidate_id: candidateId,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string } | null;
      
      if (result && !result.success) {
        throw new Error(result.error || 'Failed to delete candidate');
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['candidates'] }),
  });
}
