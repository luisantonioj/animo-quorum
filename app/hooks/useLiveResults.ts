/**
 * useLiveResults.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches all positions with their candidates and live vote counts.
 * Updates in real-time via a Supabase channel subscription on the Votes table.
 *
 * Tables used:
 *   Positions  → id, position_name, display_order, created_at
 *   Candidates → id, name, partylist, position_id, email, credentials
 *   Votes      → id, student_id, candidate_id, position_id, is_valid, created_at
 *
 * SUPABASE RLS REQUIRED:
 * ─────────────────────────────────────────────────────────────────────────────
 *   -- Authenticated users can read all positions
 *   CREATE POLICY "read positions" ON "Positions"
 *     FOR SELECT USING (auth.role() = 'authenticated');
 *
 *   -- Authenticated users can read all candidates
 *   CREATE POLICY "read candidates" ON "Candidates"
 *     FOR SELECT USING (auth.role() = 'authenticated');
 *
 *   -- Authenticated users can read valid votes (for count only — no student_id exposed)
 *   CREATE POLICY "read valid votes" ON "Votes"
 *     FOR SELECT USING (auth.role() = 'authenticated');
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../utils/supabase';

// =============================================================================
// TYPES
// =============================================================================

export interface LiveCandidate {
  id: string;
  name: string;
  partylist: string;
  position_id: string;
  votes: number;
}

export interface LivePosition {
  id: string;
  position_name: string;
  display_order: number;
  college?: string;
  candidates: LiveCandidate[];
  totalVotes: number;
}

interface UseLiveResultsReturn {
  positions: LivePosition[];
  isLoading: boolean;
  isError: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// =============================================================================
// HOOK
// =============================================================================

export function useLiveResults(cycleId?: string | null): UseLiveResultsReturn {
  const [positions, setPositions] = useState<LivePosition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const fetchResults = useCallback(async () => {
    try {
      setIsLoading(true);  // ← add this
      setIsError(false);
      setError(null);
      if (!cycleId) {
        setPositions([]);
        return;
      }

      const { data: posData, error: posErr } = await supabase
        .from('Positions')
        .select('id, position_name, display_order, college')
        .order('display_order', { ascending: true });

      if (posErr) throw posErr;
      if (!posData || posData.length === 0) {
        setPositions([]);
        return;
      }

      const { data: tallyData, error: tallyErr } = await supabase.rpc('get_vote_tally', {
        p_cycle_id: cycleId,
      });
      if (tallyErr) throw tallyErr;

      const tallyRows = tallyData ?? [];

      const enriched: LivePosition[] = posData.map(pos => {
        const positionRows = tallyRows.filter(row => row.position_id === pos.id);
        const candidates: LiveCandidate[] = positionRows
          .map(row => ({
            id:          row.candidate_id,
            name:        row.candidate_name,
            partylist:   row.partylist ?? '',
            position_id: row.position_id,
            votes:       row.vote_count ?? 0,
          }))
          .sort((a, b) => b.votes - a.votes);

        return {
          id:            pos.id,
          position_name: pos.position_name,
          display_order: pos.display_order,
          college:       pos.college || 'Executive Council', 
          candidates,
          totalVotes:    candidates.reduce((sum, c) => sum + c.votes, 0),
        };
      });

      setPositions(enriched);
    } catch (e: any) {
      setIsError(true);
      setError(e?.message ?? 'Failed to load live results.');
    } finally {
      setIsLoading(false);
    }
  }, [cycleId]);

  useEffect(() => {
    // Initial fetch
    fetchResults();

    // Real-time subscription — refetch whenever any row in Votes changes
    const channel = supabase
      .channel(`live-votes-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'Votes' },
        () => {
          // A vote was inserted/updated/deleted — refresh the counts
          fetchResults();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchResults]);

  return { positions, isLoading, isError, error, refetch: fetchResults };
}
