/**
 * app/screens/student/VoteScreen.tsx
 *
 * Ballot screen — reads live candidate data from Supabase and submits
 * securely using the authenticated user's session.
 *
 * FLOW:
 * 1. Setup phase   — student selects department + gives consent
 * 2. Ballot phase  — vote on Executive Council & Department positions
 * 3. Success phase — confirmation screen after submission (or Already Voted state)
 *
 * ABSTAIN: Every position card includes an "Abstain" option.
 * Selecting Abstain counts toward progress (position is "done") but does NOT
 * insert a vote row into the database for that position.
 */
import React, { useState, useMemo, useCallback, useRef, useEffect, createContext, useContext } from 'react';
import {
  View, Text, Pressable, StyleSheet,
  ScrollView, Modal, Animated, Image, Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../utils/supabase';

import { useAuthStore } from '../../stores/authStore';
import { useCandidateStore, DEPARTMENTS, EXECUTIVE_POSITIONS, DEPARTMENT_POSITIONS, PROGRAM_COORDINATOR_POSITION, PROGRAMS } from '../../stores/candidateStore';
import type { Candidate, Department, BallotPosition, Position, VoterDepartment } from '../../stores/candidateStore';
import { useVotingStore } from '../../stores/votingStore';
import { CandidateModal } from '../../components/CandidateModal';
import type { CandidateRow } from '../../components/CandidateModal';
import { notifyVotingStarted, notifyVoteSubmitted } from '../../notifications/notificationService';
import { useThemeColors, ThemeColors } from '../../theme';
import { useThemeStore } from '../../stores/themeStore';

// ─── Sentinel value for Abstain ────────────────────────────────────────────────
// Stored in selectedCandidates[positionId] when the student chooses to abstain.
// Abstain entries are excluded from the database insert.
const ABSTAIN_ID = '__ABSTAIN__';

// ─── File-local theme context (avoids prop-drilling C and s to sub-components) ─
type VoteCtx = { C: ThemeColors; s: ReturnType<typeof makeStyles> };
const VoteContext = createContext<VoteCtx>(null as any);
const useVC = () => useContext(VoteContext);

// ─── Types ─────────────────────────────────────────────────────────────────────
type Phase = 'setup' | 'ballot' | 'success' | 'already_voted';
interface ConfirmEntry {
  positionName: string;
  candidateName: string;
  partylist: string | null;
  department: Department;
  isAbstain: boolean;
}

const VOTER_DEPARTMENTS = DEPARTMENTS.filter((d): d is VoterDepartment => d !== 'Executive Council');

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
}
function toCandidateRow(c: Candidate): CandidateRow {
  return { id: c.id, name: c.name, partylist: c.partylist || null, position_id: c.position_id,
           email: c.email, credentials: c.credentials, platform: c.platform, photo_url: c.photo_url,
           Positions: { position_name: c.position_name } };
}

// ─── CandidateItem ─────────────────────────────────────────────────────────────
const CandidateItem: React.FC<{
  candidate: Candidate;
  selected: boolean;
  onSelect: () => void;
  onView: () => void;
}> = ({ candidate, selected, onSelect, onView }) => {
  const { C, s } = useVC();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.97, duration: 80, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 180, friction: 8 }),
    ]).start();
    onSelect();
  }, [scaleAnim, onSelect]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        style={({ pressed }) => [
          s.candidateRow,
          selected && s.candidateRowSelected,
          pressed && { opacity: 0.82 },
        ]}
        onPress={handlePress}
      >
        <View style={[s.candidateAvatar, selected && s.candidateAvatarSelected]}>
          {candidate.photo_url
            ? <Image source={{ uri: candidate.photo_url }} style={s.candidateAvatarImage} />
            : <Text style={[s.candidateAvatarText, selected && s.candidateAvatarTextSelected]}>{getInitials(candidate.name)}</Text>
          }
        </View>
        <View style={s.candidateInfo}>
          <Text style={[s.candidateName, selected && s.candidateNameSelected]} numberOfLines={1}>{candidate.name}</Text>
          {candidate.partylist ? <Text style={s.candidateParty} numberOfLines={1}>{candidate.partylist}</Text> : null}
        </View>
        <Pressable
          style={({ pressed }) => [s.viewProfileBtn, pressed && { opacity: 0.8 }]}
          onPress={onView}
          hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
        >
          <Text style={s.viewProfileBtnText}>View</Text>
        </Pressable>
        <View style={[s.radio, selected && s.radioSelected]}>
          {selected && <View style={s.radioDot} />}
        </View>
      </Pressable>
    </Animated.View>
  );
};

// ─── AbstainItem ───────────────────────────────────────────────────────────────
const AbstainItem: React.FC<{
  selected: boolean;
  onSelect: () => void;
}> = ({ selected, onSelect }) => {
  const { C, s } = useVC();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.97, duration: 80, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 180, friction: 8 }),
    ]).start();
    onSelect();
  }, [scaleAnim, onSelect]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        style={({ pressed }) => [
          s.abstainRow,
          selected && s.abstainRowSelected,
          pressed && { opacity: 0.82 },
        ]}
        onPress={handlePress}
      >
        <View style={[s.abstainIconWrap, selected && s.abstainIconWrapSelected]}>
          <Ionicons name="hand-left-outline" size={18} color={selected ? C.amber : C.textMuted} />
        </View>
        <View style={s.candidateInfo}>
          <Text style={[s.abstainLabel, selected && s.abstainLabelSelected]}>Abstain</Text>
          <Text style={s.abstainSub}>I choose not to vote for this position</Text>
        </View>
        <View style={[s.radio, selected && s.radioAbstainSelected]}>
          {selected && <View style={s.radioDotAbstain} />}
        </View>
      </Pressable>
    </Animated.View>
  );
};

// ─── PositionCard ──────────────────────────────────────────────────────────────
const PositionCard: React.FC<{
  ballotPosition: BallotPosition;
  selectedId: string | undefined;
  onSelectCandidate: (id: string) => void;
  onViewCandidate: (c: Candidate) => void;
}> = ({ ballotPosition, selectedId, onSelectCandidate, onViewCandidate }) => {
  const { C, s } = useVC();
  const isDone      = !!selectedId;
  const isAbstaining = selectedId === ABSTAIN_ID;
  const selectedCandidate = isAbstaining
    ? null
    : ballotPosition.candidates.find(c => c.id === selectedId);

  return (
    <View style={[s.positionCard, isDone && s.positionCardDone, isAbstaining && s.positionCardAbstained]}>
      <View style={s.positionHeader}>
        <View style={s.positionMeta}>
          <Text style={s.positionName}>{ballotPosition.position_name}</Text>
          <Text style={s.positionCount}>{ballotPosition.candidates.length} candidate{ballotPosition.candidates.length !== 1 ? 's' : ''}</Text>
        </View>
        {isDone
          ? isAbstaining
            ? <View style={s.abstainBadge}><Ionicons name="hand-left" size={11} color={C.amber} /><Text style={s.abstainBadgeText}> Abstaining</Text></View>
            : <View style={s.doneBadge}><Ionicons name="checkmark-circle" size={12} color={C.greenBright} /><Text style={s.doneBadgeText}> Selected</Text></View>
          : <View style={s.pendingBadge}><Text style={s.pendingBadgeText}>Required</Text></View>
        }
      </View>

      {/* Selection banner — shown for a chosen candidate */}
      {selectedCandidate && (
        <View style={s.selectionBanner}>
          <Ionicons name="checkmark-circle" size={14} color={C.greenBright} />
          <Text style={s.selectionName} numberOfLines={1}>{selectedCandidate.name}</Text>
          {selectedCandidate.partylist ? <Text style={s.selectionParty} numberOfLines={1}>· {selectedCandidate.partylist}</Text> : null}
        </View>
      )}

      {/* Abstain banner — shown when abstaining */}
      {isAbstaining && (
        <View style={s.abstainBanner}>
          <Ionicons name="hand-left" size={13} color={C.amber} />
          <Text style={s.abstainBannerText}>You chose to abstain from this position</Text>
        </View>
      )}

      <View style={s.candidateList}>
        {ballotPosition.candidates.map(c => (
          <CandidateItem
            key={c.id}
            candidate={c}
            selected={c.id === selectedId}
            onSelect={() => onSelectCandidate(c.id)}
            onView={() => onViewCandidate(c)}
          />
        ))}

        {/* Divider before Abstain */}
        <View style={s.abstainDivider}>
          <View style={s.abstainDividerLine} />
          <Text style={s.abstainDividerText}>or</Text>
          <View style={s.abstainDividerLine} />
        </View>

        <AbstainItem
          selected={isAbstaining}
          onSelect={() => onSelectCandidate(ABSTAIN_ID)}
        />
      </View>
    </View>
  );
};

// ─── ConfirmModal ──────────────────────────────────────────────────────────────
const ConfirmModal: React.FC<{
  visible: boolean;
  isSubmitting: boolean;
  entries: ConfirmEntry[];
  onSubmit: () => void;
  onCancel: () => void;
}> = ({ visible, isSubmitting, entries, onSubmit, onCancel }) => {
  const { C, s } = useVC();
  const abstainCount = entries.filter(e => e.isAbstain).length;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.modalOverlay}>
        <View style={s.modalSheet}>
          <View style={s.modalHeader}>
            <View style={s.modalIconWrap}><Ionicons name="shield-checkmark-outline" size={22} color={C.greenBright} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle}>Confirm Your Votes</Text>
              <Text style={s.modalSubtitle}>
                Review carefully — this cannot be undone.
                {abstainCount > 0 ? `  ·  ${abstainCount} abstention${abstainCount > 1 ? 's' : ''}` : ''}
              </Text>
            </View>
            <Pressable
              onPress={onCancel}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={({ pressed }) => pressed && { opacity: 0.75 }}
              disabled={isSubmitting}
            >
              <Ionicons name="close" size={20} color={C.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={s.confirmScroll} showsVerticalScrollIndicator={false} bounces={false}>
            {entries.map((entry, i) => (
              <View key={i} style={s.confirmRow}>
                {entry.isAbstain
                  ? <View style={s.confirmDotAbstain} />
                  : <View style={s.confirmDot} />
                }
                <View style={{ flex: 1 }}>
                  <Text style={s.confirmPosition}>{entry.positionName}</Text>
                  {entry.isAbstain
                    ? <Text style={s.confirmAbstainLabel}>Abstain</Text>
                    : <Text style={s.confirmCandidate}>{entry.candidateName}</Text>
                  }
                  {!entry.isAbstain && entry.partylist
                    ? <Text style={s.confirmParty}>{entry.partylist}</Text>
                    : null
                  }
                </View>
              </View>
            ))}
            <View style={{ height: 8 }} />
          </ScrollView>

          <View style={s.modalActions}>
            <Pressable
              style={({ pressed }) => [s.modalCancelBtn, pressed && { opacity: 0.85 }]}
              onPress={onCancel}
              disabled={isSubmitting}
            >
              <Text style={s.modalCancelText}>Review Again</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.modalSubmitBtn, (isSubmitting || pressed) && { opacity: 0.88 }]}
              onPress={onSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="send" size={15} color="#fff" />
                  <Text style={s.modalSubmitText}>Submit Votes</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ─── SetupScreen ───────────────────────────────────────────────────────────────
const SetupScreen: React.FC<{
  selectedDept: VoterDepartment | null;
  onSelectDept: (d: VoterDepartment) => void;
  selectedProgram: string | null;
  onSelectProgram: (p: string) => void;
  consented: boolean;
  onToggleConsent: () => void;
  onBegin: () => void;
  isLoading: boolean;
}> = ({ selectedDept, onSelectDept, selectedProgram, onSelectProgram, consented, onToggleConsent, onBegin, isLoading }) => {
  const { C, s } = useVC();
  const canBegin = !!selectedDept && !!selectedProgram && consented && !isLoading;
  const programs = selectedDept ? PROGRAMS[selectedDept] : [];

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={s.setupContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.setupHero}>
        <View style={s.setupIconWrap}><Ionicons name="checkmark-done-circle-outline" size={36} color={C.greenBright} /></View>
        <Text style={s.setupTitle}>Cast Your Vote</Text>
        <Text style={s.setupSubtitle}>SY 2025–2026 · DLSL COMELEC</Text>
      </View>

      <View style={s.setupSection}>
        <Text style={s.setupSectionLabel}>Your Department *</Text>
        <Text style={s.setupSectionHint}>Determines which college-level positions appear on your ballot. Executive Council positions are shown to all students.</Text>
        <View style={s.deptGrid}>
          {VOTER_DEPARTMENTS.map(d => (
            <Pressable
              key={d}
              style={({ pressed }) => [
                s.deptChip,
                selectedDept === d && s.deptChipActive,
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => onSelectDept(d)}
            >
              <Text style={[s.deptChipText, selectedDept === d && s.deptChipTextActive]}>{d}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {selectedDept && (
        <View style={s.setupSection}>
          <Text style={s.setupSectionLabel}>Your Program *</Text>
          <Text style={s.setupSectionHint}>Determines which program coordinator position appears on your ballot.</Text>
          <View style={s.deptGrid}>
            {programs.map(p => (
              <Pressable
                key={p}
                style={({ pressed }) => [
                  s.deptChip,
                  selectedProgram === p && s.deptChipActive,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => onSelectProgram(p)}
              >
                <Text style={[s.deptChipText, selectedProgram === p && s.deptChipTextActive]}>{p}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <View style={s.setupSection}>
        <Text style={s.setupSectionLabel}>Voter Consent *</Text>
        <Pressable style={({ pressed }) => [s.consentRow, pressed && { opacity: 0.85 }]} onPress={onToggleConsent}>
          <View style={[s.checkbox, consented && s.checkboxActive]}>
            {consented && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
          <Text style={s.consentText}>
            I confirm that I am a registered DLSL student and I understand that my vote is{' '}
            <Text style={s.consentHighlight}>final and cannot be changed</Text> once submitted.
          </Text>
        </Pressable>
      </View>

      {!selectedDept ? (
        <View style={s.warnBox}><Ionicons name="alert-circle-outline" size={14} color={C.amber} /><Text style={s.warnText}>Please select your department to continue.</Text></View>
      ) : !selectedProgram ? (
        <View style={s.warnBox}><Ionicons name="alert-circle-outline" size={14} color={C.amber} /><Text style={s.warnText}>Please select your program to continue.</Text></View>
      ) : !consented ? (
        <View style={s.warnBox}><Ionicons name="alert-circle-outline" size={14} color={C.amber} /><Text style={s.warnText}>Please check the consent box to continue.</Text></View>
      ) : null}

      <Pressable
        style={({ pressed }) => [
          s.beginBtn,
          !canBegin && s.beginBtnDisabled,
          canBegin && pressed && { opacity: 0.88 },
        ]}
        onPress={onBegin}
        disabled={!canBegin}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={C.textMuted} />
        ) : (
          <>
            <Ionicons name="chevron-forward-circle-outline" size={20} color={canBegin ? '#fff' : C.textMuted} />
            <Text style={[s.beginBtnText, !canBegin && s.beginBtnTextDisabled]}>Begin Voting</Text>
          </>
        )}
      </Pressable>

      <View style={s.setupFooter}>
        <Ionicons name="lock-closed-outline" size={12} color={C.textMuted} />
        <Text style={s.setupFooterText}>Secured by AnimoQuorum · DLSL COMELEC SY 2025–2026</Text>
      </View>
    </ScrollView>
  );
};

// ─── SuccessScreen ─────────────────────────────────────────────────────────────
const SuccessScreen: React.FC<{ alreadyVoted?: boolean }> = ({ alreadyVoted }) => {
  const { C, s } = useVC();
  return (
    <View style={s.successContainer}>
      <View style={s.successIconWrap}>
        <Ionicons name={alreadyVoted ? 'information-circle' : 'checkmark-circle'} size={80} color={C.greenBright} />
      </View>
      <Text style={s.successTitle}>{alreadyVoted ? 'Already Voted' : 'Vote Submitted!'}</Text>
      <Text style={s.successBody}>
        {alreadyVoted
          ? 'You have already cast your ballot for this election.\n\nThank you for participating!'
          : 'Your choices have been securely recorded.\n\nThank you for participating in the DLSL Student Council Election, Lasallian!'
        }
      </Text>
      <View style={s.successBadge}>
        <Ionicons name="shield-checkmark-outline" size={14} color={C.textSub} />
        <Text style={s.successBadgeText}> Secured by AnimoQuorum</Text>
      </View>
    </View>
  );
};

// ─── Main VoteScreen ───────────────────────────────────────────────────────────
export function VoteScreen() {
  const C      = useThemeColors();
  const isDark = useThemeStore(st => st.isDark);
  const s      = useMemo(() => makeStyles(C), [C]);
  const ctxVal = useMemo(() => ({ C, s }), [C, s]);

  const queryClient = useQueryClient();
  const userProfile = useAuthStore(state => state.userProfile);
  const disabledPositions = useCandidateStore(state => state.disabledPositions);
  const { selectedCandidates, selectCandidate, reset } = useVotingStore();

  const [phase, setPhase]                   = useState<Phase>('setup');
  const [selectedDept, setSelectedDept]     = useState<VoterDepartment | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<string | null>(null);
  const [consented, setConsented]           = useState(false);

  const handleSelectDept = useCallback((d: VoterDepartment) => {
    setSelectedDept(d);
    setSelectedProgram(null);
  }, []);
  const [viewedCandidate, setViewedCandidate] = useState<Candidate | null>(null);
  const [confirmVisible, setConfirmVisible]   = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const didNotifyRef = useRef(false);

  useEffect(() => {
    if (!didNotifyRef.current) { didNotifyRef.current = true; notifyVotingStarted(); }
  }, []);

  // ─── Supabase Queries & Mutations ──────────────────────────────────────────

  const { data: dbCandidates = [], isLoading: isLoadingCandidates } = useQuery({
    queryKey: ['candidates', 'student'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('Candidates')
        .select('*, Positions(position_name, college, program)');
      if (error) throw error;
      return data;
    },
  });

  const { data: hasVoted, isLoading: isLoadingVotes } = useQuery({
    queryKey: ['my_votes', userProfile?.id],
    queryFn: async () => {
      if (!userProfile?.id) return false;
      const { count, error } = await supabase
        .from('Votes')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', userProfile.id);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    enabled: !!userProfile?.id,
  });

  // Automatically skip to Already Voted screen if they have previous votes
  useEffect(() => {
    if (hasVoted && phase === 'setup') {
      setPhase('already_voted');
    }
  }, [hasVoted, phase]);

  const submitVotesMutation = useMutation({
    mutationFn: async (selections: Record<string, string>) => {
      if (!userProfile?.id) throw new Error('You must be logged in to vote.');

      // Abstentions 
      const votesToInsert = Object.entries(selections)
        .map(([posId, candId]) => ({
          student_id:   userProfile.id,
          position_id:  posId,
          candidate_id: candId === ABSTAIN_ID ? null : candId,
          is_valid:     true,
        }));

      if (votesToInsert.length > 0) {
        const { error } = await supabase.from('Votes').insert(votesToInsert);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my_votes'] }),
  });

  // ─── Data Transformations ──────────────────────────────────────────────────

  const candidates: Candidate[] = useMemo(() => {
    return dbCandidates.map((c: any) => {
      const college      = c.Positions?.college as string | null;
      const dept: Department = college ? college as Department : 'Executive Council';
      const fullPosName  = c.Positions?.position_name || '';
      const prog: string | null = c.Positions?.program ?? null;

      // Strip the college prefix from the display name, same as AdminCandidatesScreen
      const posName =
        dept !== 'Executive Council' && fullPosName.startsWith(dept + ' ')
          ? fullPosName.slice(dept.length + 1)
          : fullPosName;

      return {
        id:            c.id,
        name:          c.name,
        partylist:     c.partylist || '',
        position_id:   c.position_id,
        position_name: posName as Position,
        department:    dept,
        program:       prog,
        photo_url:     c.photo_url,
        email:         c.email,
        credentials:   c.credentials,
        platform:      c.platform,
      };
    });
  }, [dbCandidates]);

  const getCandidatesForBallot = useCallback((voterDepartment: VoterDepartment, voterProgram: string | null): BallotPosition[] => {
    const visible = candidates.filter((c) => {
      if (c.department === 'Executive Council') return true;   // (3) council execs — all students
      if (c.department !== voterDepartment) return false;       // wrong dept — excluded
      if ((c.program ?? null) === null) return true;            // (2) dept exec — no program tag
      return (c.program ?? null) === voterProgram;              // (1) own program coordinator only
    });

    const positionMap = new Map<string, BallotPosition>();

    visible.forEach((c) => {
      if (disabledPositions.has(c.position_id)) return;

      if (!positionMap.has(c.position_id)) {
        positionMap.set(c.position_id, {
          position_id:   c.position_id,
          position_name: c.position_name,
          department:    c.department,
          program:       c.program ?? null,
          candidates:    [],
        });
      }
      positionMap.get(c.position_id)!.candidates.push(c);
    });

    const execOrder = [...EXECUTIVE_POSITIONS] as string[];
    const deptOrder = [...DEPARTMENT_POSITIONS] as string[];

    return [...positionMap.values()].sort((a, b) => {
      const aIsCoord = a.position_name === PROGRAM_COORDINATOR_POSITION;
      const bIsCoord = b.position_name === PROGRAM_COORDINATOR_POSITION;
      if (aIsCoord && !bIsCoord) return 1;
      if (!aIsCoord && bIsCoord) return -1;

      const aExecIdx = execOrder.indexOf(a.position_name);
      const bExecIdx = execOrder.indexOf(b.position_name);
      const aDeptIdx = deptOrder.indexOf(a.position_name);
      const bDeptIdx = deptOrder.indexOf(b.position_name);

      if (aExecIdx !== -1 && bExecIdx !== -1) return aExecIdx - bExecIdx;
      if (aExecIdx !== -1) return -1;
      if (bExecIdx !== -1) return 1;
      return aDeptIdx - bDeptIdx;
    });
  }, [candidates, disabledPositions]);

  const ballotPositions = useMemo((): BallotPosition[] => {
    if (!selectedDept) return [];
    return getCandidatesForBallot(selectedDept, selectedProgram);
  }, [selectedDept, selectedProgram, getCandidatesForBallot]);

  const execPositions = useMemo(() => ballotPositions.filter(bp => bp.department === 'Executive Council'), [ballotPositions]);
  const deptPositions = useMemo(() => ballotPositions.filter(bp => bp.department !== 'Executive Council'), [ballotPositions]);

  const totalPositions = ballotPositions.length;
  // Abstain counts as "selected" for progress — student has made a decision
  const selectedCount = useMemo(
    () => ballotPositions.filter(bp => !!selectedCandidates[bp.position_id]).length,
    [ballotPositions, selectedCandidates],
  );
  const allSelected = totalPositions > 0 && selectedCount === totalPositions;
  const progressPct = totalPositions > 0 ? (selectedCount / totalPositions) * 100 : 0;

  const confirmEntries: ConfirmEntry[] = useMemo(() =>
    ballotPositions
      .filter(bp => !!selectedCandidates[bp.position_id])
      .map(bp => {
        const selId    = selectedCandidates[bp.position_id];
        const isAbstain = selId === ABSTAIN_ID;
        const cand     = isAbstain ? undefined : bp.candidates.find(c => c.id === selId);
        return {
          positionName:  bp.position_name,
          candidateName: isAbstain ? 'Abstain' : cand?.name ?? '—',
          partylist:     isAbstain ? null : cand?.partylist ?? null,
          department:    bp.department,
          isAbstain,
        };
      }),
  [ballotPositions, selectedCandidates]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleBegin = useCallback(() => {
    if (!selectedDept || !selectedProgram || !consented) return;
    reset(); setPhase('ballot');
  }, [selectedDept, selectedProgram, consented, reset]);

  const handleGoBack = useCallback(() => {
    Alert.alert('Go Back to Setup?', 'Your current vote selections will be cleared.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Go Back', style: 'destructive', onPress: () => { reset(); setConsented(false); setSelectedProgram(null); setPhase('setup'); } },
    ]);
  }, [reset]);

  const handleConfirmSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await submitVotesMutation.mutateAsync(selectedCandidates);
      await notifyVoteSubmitted();
      setConfirmVisible(false);
      reset();
      setPhase('success');
    } catch (err: any) {
      Alert.alert('Submission Failed', err.message || 'Could not submit votes. You may have already voted.');
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedCandidates, submitVotesMutation, reset]);

  const renderSection = useCallback((label: string, positions: BallotPosition[]) => {
    if (positions.length === 0) return null;
    return (
      <View key={label}>
        <Text style={s.sectionLabel}>{label}</Text>
        {positions.map(bp => (
          <PositionCard
            key={bp.position_id}
            ballotPosition={bp}
            selectedId={selectedCandidates[bp.position_id]}
            onSelectCandidate={id => selectCandidate(bp.position_id, id)}
            onViewCandidate={c => setViewedCandidate(c)}
          />
        ))}
      </View>
    );
  }, [selectedCandidates, selectCandidate, s]);

  return (
    <VoteContext.Provider value={ctxVal}>
      <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>

        {/* ── Setup phase ── */}
        {phase === 'setup' && (
          <SetupScreen
            selectedDept={selectedDept}
            onSelectDept={handleSelectDept}
            selectedProgram={selectedProgram}
            onSelectProgram={setSelectedProgram}
            consented={consented}
            onToggleConsent={() => setConsented(v => !v)}
            onBegin={handleBegin}
            isLoading={isLoadingCandidates || isLoadingVotes}
          />
        )}

        {/* ── Success phases ── */}
        {phase === 'success'       && <SuccessScreen />}
        {phase === 'already_voted' && <SuccessScreen alreadyVoted />}

        {/* ── Ballot phase ── */}
        {phase === 'ballot' && (
          <>
            <View style={s.header}>
              <Pressable
                style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.75 }]}
                onPress={handleGoBack}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="chevron-back" size={20} color={C.textSub} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={s.headerTitle}>Cast Your Vote</Text>
                <Text style={s.headerSub} numberOfLines={1}>SY 2025–2026 · {selectedDept ?? 'DLSL COMELEC'}{selectedProgram ? ` · ${selectedProgram}` : ''}</Text>
              </View>
              <View style={[s.progressPill, allSelected && s.progressPillDone]}>
                <Text style={[s.progressText, allSelected && { color: C.greenBright }]}>{selectedCount}/{totalPositions}</Text>
              </View>
            </View>

            <View style={s.progressBarTrack}>
              <View style={[s.progressBarFill, { width: `${progressPct}%` }]} />
            </View>

            <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
              {ballotPositions.length === 0 ? (
                <View style={s.emptyBallot}>
                  <Ionicons name="clipboard-outline" size={44} color={C.textMuted} />
                  <Text style={s.emptyBallotTitle}>No Positions Available</Text>
                  <Text style={s.emptyBallotBody}>There are no active ballot positions for your department at this time.</Text>
                </View>
              ) : (
                <>
                  {renderSection('Executive Council', execPositions)}
                  {renderSection(selectedDept ?? 'Department', deptPositions)}
                </>
              )}

              {ballotPositions.length > 0 && (
                <View style={s.submitSection}>
                  {!allSelected && (
                    <View style={s.submitHint}>
                      <Ionicons name="information-circle-outline" size={14} color={C.textMuted} />
                      <Text style={s.submitHintText}>
                        {totalPositions - selectedCount} position{totalPositions - selectedCount !== 1 ? 's' : ''} remaining — select a candidate or abstain
                      </Text>
                    </View>
                  )}
                  <Pressable
                    style={({ pressed }) => [
                      s.submitBtn,
                      !allSelected && s.submitBtnDisabled,
                      allSelected && pressed && { opacity: 0.88 },
                    ]}
                    onPress={() => allSelected && setConfirmVisible(true)}
                    disabled={!allSelected}
                  >
                    <Ionicons name="send" size={16} color={allSelected ? '#fff' : C.textMuted} />
                    <Text style={[s.submitBtnText, !allSelected && s.submitBtnTextDisabled]}>
                      {allSelected ? 'Submit My Votes' : 'Complete All Positions First'}
                    </Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>

            <CandidateModal
              candidate={viewedCandidate ? toCandidateRow(viewedCandidate) : null}
              visible={!!viewedCandidate}
              onClose={() => setViewedCandidate(null)}
              alreadyVoted={viewedCandidate ? !!selectedCandidates[viewedCandidate.position_id] : false}
              onSelect={row => { selectCandidate(row.position_id, row.id); setViewedCandidate(null); }}
            />

            <ConfirmModal
              visible={confirmVisible}
              isSubmitting={isSubmitting}
              entries={confirmEntries}
              onSubmit={handleConfirmSubmit}
              onCancel={() => setConfirmVisible(false)}
            />
          </>
        )}
      </SafeAreaView>
    </VoteContext.Provider>
  );
}

function makeStyles(C: ThemeColors) {
  const borderBright = C.text === '#F0FFF0' ? 'rgba(27,98,53,0.40)' : 'rgba(27,98,53,0.22)';
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },

    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, gap: 10 },
    backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    headerTitle: { fontSize: 17, fontWeight: '800', color: C.text },
    headerSub:   { fontSize: 11, color: C.textMuted, marginTop: 2, letterSpacing: 0.4 },

    progressPill:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface2, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: C.border },
    progressPillDone: { backgroundColor: C.greenLight, borderColor: C.greenBright + '55' },
    progressText:     { fontSize: 12, fontWeight: '700', color: C.textMuted },

    progressBarTrack: { height: 3, backgroundColor: C.border },
    progressBarFill:  { height: 3, backgroundColor: C.greenBright },

    list: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28 },

    sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: C.greenBright, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },

    // ── Position card ──────────────────────────────────────────────────────────
    positionCard: {
      backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, marginBottom: 14, overflow: 'hidden',
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
    },
    positionCardDone:      { borderColor: C.greenBright + '55' },
    positionCardAbstained: { borderColor: C.amber + '55' },
    positionHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: C.border },
    positionMeta:     { gap: 2 },
    positionName:     { fontSize: 14, fontWeight: '700', color: C.text },
    positionCount:    { fontSize: 11, color: C.textMuted },

    doneBadge:        { flexDirection: 'row', alignItems: 'center', backgroundColor: C.greenLight, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: C.greenBright + '44' },
    doneBadgeText:    { fontSize: 11, fontWeight: '700', color: C.greenBright },
    pendingBadge:     { backgroundColor: C.surface2, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: C.border },
    pendingBadgeText: { fontSize: 11, fontWeight: '600', color: C.textMuted },

    // Abstain badge (header)
    abstainBadge:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.amberGlow, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: C.amber + '44' },
    abstainBadgeText: { fontSize: 11, fontWeight: '700', color: C.amber },

    // Selection banners
    selectionBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.greenLight, paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: borderBright },
    selectionName:   { fontSize: 13, fontWeight: '700', color: C.greenBright, flex: 1 },
    selectionParty:  { fontSize: 12, color: C.textSub },

    abstainBanner:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.amberGlow, paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.amber + '33' },
    abstainBannerText: { fontSize: 13, fontWeight: '600', color: C.amber, flex: 1 },

    candidateList: { padding: 10, gap: 8 },

    candidateRow:         { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2 },
    candidateRowSelected: { backgroundColor: C.greenLight, borderColor: C.greenBright + '44' },

    candidateAvatar:             { width: 42, height: 42, borderRadius: 21, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    candidateAvatarSelected:     { borderColor: C.greenBright },
    candidateAvatarImage:        { width: 42, height: 42, borderRadius: 21 },
    candidateAvatarText:         { fontSize: 14, fontWeight: '800', color: C.textSub },
    candidateAvatarTextSelected: { color: C.greenBright },

    candidateInfo:         { flex: 1 },
    candidateName:         { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 2 },
    candidateNameSelected: { color: C.greenBright },
    candidateParty:        { fontSize: 11, color: C.textMuted },

    viewProfileBtn:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: borderBright, backgroundColor: C.surface },
    viewProfileBtnText: { fontSize: 10, color: C.textSub, fontWeight: '600' },

    radio:             { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
    radioSelected:     { borderColor: C.greenBright },
    radioDot:          { width: 10, height: 10, borderRadius: 5, backgroundColor: C.greenBright },
    radioAbstainSelected: { borderColor: C.amber },
    radioDotAbstain:      { width: 10, height: 10, borderRadius: 5, backgroundColor: C.amber },

    // ── Abstain divider ────────────────────────────────────────────────────────
    abstainDivider:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 },
    abstainDividerLine: { flex: 1, height: 1, backgroundColor: C.border },
    abstainDividerText: { fontSize: 10, fontWeight: '600', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1 },

    // ── Abstain row ────────────────────────────────────────────────────────────
    abstainRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
      borderRadius: 12, borderWidth: 1, borderColor: C.border,
      backgroundColor: C.surface2, borderStyle: 'dashed',
    },
    abstainRowSelected: {
      backgroundColor: C.amberGlow,
      borderColor: C.amber + '66',
      borderStyle: 'solid',
    },
    abstainIconWrap:         { width: 42, height: 42, borderRadius: 21, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
    abstainIconWrapSelected: { borderColor: C.amber, backgroundColor: C.amberGlow },
    abstainLabel:            { fontSize: 13, fontWeight: '700', color: C.textMuted, marginBottom: 2 },
    abstainLabelSelected:    { color: C.amber },
    abstainSub:              { fontSize: 11, color: C.textMuted },

    emptyBallot:      { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
    emptyBallotTitle: { fontSize: 17, fontWeight: '700', color: C.text },
    emptyBallotBody:  { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 20, maxWidth: 280 },

    submitSection:  { paddingTop: 4, paddingBottom: 32, gap: 10 },
    submitHint:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
    submitHintText: { fontSize: 12, color: C.textMuted },
    submitBtn: {
      backgroundColor: C.green, borderRadius: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      shadowColor: C.green, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 4,
    },
    submitBtnDisabled:     { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, shadowOpacity: 0, elevation: 0 },
    submitBtnText:         { color: '#fff', fontSize: 15, fontWeight: '700' },
    submitBtnTextDisabled: { color: C.textMuted },

    successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    successIconWrap:  { marginBottom: 20 },
    successTitle:     { fontSize: 26, fontWeight: '800', color: C.text, marginBottom: 12 },
    successBody:      { fontSize: 15, color: C.textSub, textAlign: 'center', lineHeight: 24, marginBottom: 24 },
    successBadge:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface2, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: C.border },
    successBadgeText: { fontSize: 12, color: C.textSub },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    modalSheet:   { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '82%', shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 8 },
    modalHeader:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    modalIconWrap:{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.greenLight, borderWidth: 1, borderColor: borderBright, alignItems: 'center', justifyContent: 'center' },
    modalTitle:   { fontSize: 17, fontWeight: '800', color: C.text },
    modalSubtitle:{ fontSize: 12, color: C.textMuted, marginTop: 2 },

    confirmScroll:        { maxHeight: 340, marginBottom: 16 },
    confirmRow:           { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
    confirmDot:           { width: 8, height: 8, borderRadius: 4, backgroundColor: C.greenBright, marginTop: 6, flexShrink: 0 },
    confirmDotAbstain:    { width: 8, height: 8, borderRadius: 4, backgroundColor: C.amber, marginTop: 6, flexShrink: 0 },
    confirmPosition:      { fontSize: 10, fontWeight: '700', color: C.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 },
    confirmCandidate:     { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 2 },
    confirmAbstainLabel:  { fontSize: 14, fontWeight: '700', color: C.amber, fontStyle: 'italic', marginBottom: 2 },
    confirmParty:         { fontSize: 11, color: C.textSub },

    modalActions:   { flexDirection: 'row', gap: 10, paddingTop: 4 },
    modalCancelBtn: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 13, paddingVertical: 13, alignItems: 'center', backgroundColor: C.surface2 },
    modalCancelText:{ fontSize: 14, fontWeight: '700', color: C.textMuted },
    modalSubmitBtn: { flex: 1, backgroundColor: C.green, borderRadius: 13, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, shadowColor: C.green, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 3 },
    modalSubmitText:{ fontSize: 14, fontWeight: '800', color: '#fff' },

    setupContent:      { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 60 },
    setupHero:         { alignItems: 'center', marginBottom: 32 },
    setupIconWrap:     { width: 72, height: 72, borderRadius: 36, backgroundColor: C.surface2, borderWidth: 1, borderColor: borderBright, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    setupTitle:        { fontSize: 26, fontWeight: '800', color: C.text, marginBottom: 6 },
    setupSubtitle:     { fontSize: 13, color: C.textMuted },
    setupSection:      { marginBottom: 24 },
    setupSectionLabel: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 4 },
    setupSectionHint:  { fontSize: 12, color: C.textMuted, marginBottom: 12, lineHeight: 18 },

    deptGrid:           { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    deptChip:           { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2 },
    deptChipActive:     { backgroundColor: C.greenLight, borderColor: C.greenBright },
    deptChipText:       { fontSize: 13, fontWeight: '600', color: C.textMuted },
    deptChipTextActive: { color: C.greenBright, fontWeight: '700' },

    consentRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: C.surface2, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border },
    checkbox:         { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: borderBright, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
    checkboxActive:   { backgroundColor: C.green, borderColor: C.green },
    consentText:      { flex: 1, fontSize: 13, color: C.textSub, lineHeight: 20 },
    consentHighlight: { color: C.greenBright, fontWeight: '700' },

    warnBox:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.amberGlow, borderWidth: 1, borderColor: C.amber + '55', borderRadius: 10, padding: 10, marginBottom: 12 },
    warnText: { fontSize: 12, color: C.amber, flex: 1, lineHeight: 18 },

    beginBtn:             { backgroundColor: C.green, borderRadius: 14, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, shadowColor: C.green, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 4 },
    beginBtnDisabled:     { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, shadowOpacity: 0, elevation: 0 },
    beginBtnText:         { color: '#fff', fontSize: 16, fontWeight: '800' },
    beginBtnTextDisabled: { color: C.textMuted },

    setupFooter:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 28 },
    setupFooterText: { fontSize: 11, color: C.textMuted },
  });
}

export default VoteScreen;
