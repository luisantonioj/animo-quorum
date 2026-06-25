import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../utils/supabase';
import type { Database } from '../utils/database.types';
import { useAuthStore } from '../stores/authStore';

export type ElectionCycle = Database['public']['Tables']['ElectionCycles']['Row'];
export type ElectionCycleStatus = 'draft' | 'active' | 'closed' | 'archived';

export function useElectionCycles() {
  return useQuery<ElectionCycle[]>({
    queryKey: ['election-cycles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ElectionCycles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateElectionCycle() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (label: string) => {
      const { data, error } = await supabase
        .from('ElectionCycles')
        .insert([{ label: label.trim(), status: 'draft' }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['election-cycles'] }),
  });
}

export function useUpdateElectionCycleStatus() {
  const qc = useQueryClient();
  const setActiveCycleId = useAuthStore(state => state.setActiveCycleId);

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ElectionCycleStatus }) => {
      const { error } = await supabase
        .from('ElectionCycles')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
      return { id, status };
    },
    onSuccess: ({ id, status }) => {
      if (status === 'active') setActiveCycleId(id);
      if (status === 'closed' || status === 'archived') {
        const currentActive = useAuthStore.getState().activeCycleId;
        if (currentActive === id) setActiveCycleId(null);
      }
      qc.invalidateQueries({ queryKey: ['election-cycles'] });
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['posts'] });
      qc.invalidateQueries({ queryKey: ['candidates'] });
      qc.invalidateQueries({ queryKey: ['live-results'] });
    },
  });
}
