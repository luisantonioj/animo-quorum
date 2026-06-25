/**
 * DashboardScreen.tsx — Student home screen
 * ─────────────────────────────────────────────────────────────────────────────
 * BACKEND STATUS:
 *   ✅ Posts / Announcements  → usePosts()
 *   ✅ Poll voting            → usePollResponses() + useSubmitPollResponse()
 *   ✅ Live vote results      → useLiveResults() — gated by show_live_results
 *   ✅ Voting countdown       → useSettings() (voting_start_time/voting_end_time)
 *   ✅ Comments               → useComments() + useCreateComment() + useDeleteComment()
 *   ✅ Likes                  → useLikes() + useToggleLike()
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  RefreshControl,
  Pressable,
  TextInput,
  Animated,
  StatusBar,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { KeyboardAwareFlatList } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles } from './DashboardScreen.styles';
import { useThemeColors } from '../../theme';
import { useThemeStore } from '../../stores/themeStore';
import { usePosts } from '../../hooks/usePosts';
import { useComments, useCreateComment, useDeleteComment, Comment as CommentType } from '../../hooks/useComments';
import { useLikes, useToggleLike } from '../../hooks/useLikes';
import { usePollResponses, useSubmitPollResponse } from '../../hooks/usePollResponses';
import { useLiveResults, LivePosition } from '../../hooks/useLiveResults';
import { useSettings } from '../../hooks/useSettings';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../utils/supabase';

// =============================================================================
// TYPES
// =============================================================================

interface RawPost {
  id: string;
  admin_id: string;
  type: 'announcement' | 'poll';
  title: string;
  content: string;
  created_at: string;
  PollOptions?: { id: string; post_id: string; option_text: string }[];
}

// =============================================================================
// HELPERS
// =============================================================================

function toInitials(str: string): string {
  const words = str.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function timeAgo(isoString: string): string {
  const diff  = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (days > 0)  return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0)  return `${mins}m ago`;
  return 'Just now';
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-PH', {
    month: 'long', day: 'numeric', year: 'numeric',
  }) + ' · ' + d.toLocaleTimeString('en-PH', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function secondsToHMS(total: number) {
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return { h, m, s };
}

const pad = (n: number) => String(Math.max(0, n)).padStart(2, '0');

// =============================================================================
// SECTION 1 — VOTING COUNTDOWN
// =============================================================================

const VotingCountdown: React.FC = () => {
  const C = useThemeColors();
  const S = useMemo(() => makeStyles(C), [C]);

  const activeCycleId = useAuthStore(state => state.activeCycleId);
  const { settings, votingStatus, isLoading } = useSettings();
  const [secondsLeft, setSecondsLeft]         = useState(0);
  const [secondsUntil, setSecondsUntil]       = useState(0);
  const progressAnim                          = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!settings) return;
    const tick = () => {
      const now = Date.now();
      if (settings.voting_end_time) {
        const end  = new Date(settings.voting_end_time).getTime();
        const left = Math.max(0, Math.floor((end - now) / 1000));
        setSecondsLeft(left);
        if (settings.voting_start_time) {
          const start    = new Date(settings.voting_start_time).getTime();
          const total    = end - start;
          const elapsed  = now - start;
          const fraction = Math.min(1, Math.max(0, elapsed / total));
          Animated.timing(progressAnim, {
            toValue: fraction, duration: 500, useNativeDriver: false,
          }).start();
        }
      }
      if (settings.voting_start_time) {
        const start = new Date(settings.voting_start_time).getTime();
        const until = Math.max(0, Math.floor((start - now) / 1000));
        setSecondsUntil(until);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [settings]);

  if (isLoading) {
    return (
      <View style={S.countdown.wrapper}>
        <View style={S.countdown.glowBar} />
        <ActivityIndicator color={C.green} style={{ marginVertical: 24 }} />
      </View>
    );
  }

  if (!activeCycleId) {
    return (
      <View style={S.countdown.wrapper}>
        <View style={[S.countdown.glowBar, { backgroundColor: C.textMuted }]} />
        <Text style={S.countdown.label}>Election</Text>
        <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 8, textAlign: 'center' }}>
          No active election cycle is available yet.
        </Text>
      </View>
    );
  }

  if (votingStatus === 'unconfigured') {
    return (
      <View style={S.countdown.wrapper}>
        <View style={S.countdown.glowBar} />
        <Text style={S.countdown.label}>🗳 Election</Text>
        <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 8, textAlign: 'center' }}>
          Voting schedule has not been set yet.
        </Text>
      </View>
    );
  }

  if (votingStatus === 'not_started') {
    const { h, m, s } = secondsToHMS(secondsUntil);
    return (
      <View style={S.countdown.wrapper}>
        <View style={S.countdown.glowBar} />
        <Text style={S.countdown.label}>🗳 Voting Opens In</Text>
        <View style={S.countdown.timerRow}>
          {[{ val: h, unit: 'Hrs' }, { val: m, unit: 'Min' }, { val: s, unit: 'Sec' }].map(
            (item, idx, arr) => (
              <React.Fragment key={item.unit}>
                <View style={S.countdown.timeBlock}>
                  <Text style={S.countdown.timeValue}>{pad(item.val)}</Text>
                  <Text style={S.countdown.timeUnit}>{item.unit}</Text>
                </View>
                {idx < arr.length - 1 && (
                  <Text style={S.countdown.timeSeparator}>:</Text>
                )}
              </React.Fragment>
            ),
          )}
        </View>
        <View style={S.countdown.progressTrack}>
          <Animated.View style={[S.countdown.progressBar, { width: '0%' }]} />
        </View>
        {settings?.voting_start_time && (
          <Text style={S.countdown.subText}>
            Opens: {formatDateTime(settings.voting_start_time)}
          </Text>
        )}
      </View>
    );
  }

  if (votingStatus === 'ended') {
    return (
      <View style={S.countdown.wrapper}>
        <View style={[S.countdown.glowBar, { backgroundColor: C.textMuted }]} />
        <Text style={S.countdown.label}> Voting Has Ended</Text>
        <View style={S.countdown.timerRow}>
          {['00', '00', '00'].map((v, i) => (
            <React.Fragment key={i}>
              <View style={S.countdown.timeBlock}>
                <Text style={[S.countdown.timeValue, { color: C.textMuted }]}>{v}</Text>
                <Text style={S.countdown.timeUnit}>{['Hrs', 'Min', 'Sec'][i]}</Text>
              </View>
              {i < 2 && <Text style={S.countdown.timeSeparator}>:</Text>}
            </React.Fragment>
          ))}
        </View>
        <View style={S.countdown.progressTrack}>
          <Animated.View style={[S.countdown.progressBar, { width: '100%' }]} />
        </View>
        {settings?.voting_end_time && (
          <Text style={S.countdown.subText}>
            Closed: {formatDateTime(settings.voting_end_time)}
          </Text>
        )}
      </View>
    );
  }

  const { h, m, s } = secondsToHMS(secondsLeft);
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1], outputRange: ['0%', '100%'],
  });

  return (
    <View style={S.countdown.wrapper}>
      <View style={S.countdown.glowBar} />
      <Text style={S.countdown.label}>⏱ Voting Closes In</Text>
      <View style={S.countdown.timerRow}>
        {[{ val: h, unit: 'Hrs' }, { val: m, unit: 'Min' }, { val: s, unit: 'Sec' }].map(
          (item, idx, arr) => (
            <React.Fragment key={item.unit}>
              <View style={S.countdown.timeBlock}>
                <Text style={S.countdown.timeValue}>{pad(item.val)}</Text>
                <Text style={S.countdown.timeUnit}>{item.unit}</Text>
              </View>
              {idx < arr.length - 1 && (
                <Text style={S.countdown.timeSeparator}>:</Text>
              )}
            </React.Fragment>
          ),
        )}
      </View>
      <View style={S.countdown.progressTrack}>
        <Animated.View style={[S.countdown.progressBar, { width: progressWidth }]} />
      </View>
      {settings?.voting_end_time && (
        <Text style={S.countdown.subText}>
          {formatDateTime(settings.voting_start_time ?? '')} → {formatDateTime(settings.voting_end_time)}
        </Text>
      )}
    </View>
  );
};

// =============================================================================
// SECTION 2 — VOTER TURNOUT DASHBOARD
// =============================================================================

const COLLEGE_COLORS: Record<string, string> = {
  CITE:   '#DC2626',
  CBEAM:  '#B45309',
  CON:    '#16A34A',
  CEAS:   '#1D4ED8',
  CIHTM:  '#7C3AED',
};

const COLLEGE_POPULATIONS: Record<string, number> = {
  CITE:   702,
  CBEAM:  669,
  CON:    749,
  CEAS:   748,
  CIHTM:  642,
};

const DonutRing: React.FC<{ pct: number; size: number; stroke: number }> = ({ pct, size, stroke }) => {
  const C = useThemeColors();
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View>
        <View style={{
          width: size, height: size, borderRadius: size / 2,
          borderWidth: stroke, borderColor: C.border,
          position: 'absolute',
        }} />
        <View style={{
          width: size, height: size, borderRadius: size / 2,
          borderWidth: stroke,
          borderTopColor:    C.green,
          borderRightColor:  pct > 25  ? C.green : 'transparent',
          borderBottomColor: pct > 50  ? C.green : 'transparent',
          borderLeftColor:   pct > 75  ? C.green : 'transparent',
          position: 'absolute',
          transform: [{ rotate: '-90deg' }],
          opacity: 0.9,
        }} />
      </Animated.View>
    </View>
  );
};

const LiveVotingBoard: React.FC = () => {
  const C = useThemeColors();
  const S = useMemo(() => makeStyles(C), [C]);

  const activeCycleId = useAuthStore(state => state.activeCycleId);
  const { positions, isLoading } = useLiveResults(activeCycleId);

  const stats = useMemo(() => {
    if (!positions || positions.length === 0) return null;

    const byCollege: Record<string, LivePosition[]> = {};
    positions.forEach(p => {
      const col = p.college || 'Executive Council';
      if (!byCollege[col]) byCollege[col] = [];
      byCollege[col].push(p);
    });

    const execPositions = byCollege['Executive Council'] || [];
    const overallVoted = execPositions.length > 0
      ? Math.max(...execPositions.map(p => p.totalVotes))
      : positions.length > 0 ? Math.max(...positions.map(p => p.totalVotes)) : 0;

    const collegeStats = Object.keys(byCollege)
      .filter(k => k !== 'Executive Council')
      .map(colName => {
        const pos = byCollege[colName];
        const voted = pos.length > 0 ? Math.max(...pos.map(p => p.totalVotes)) : 0;
        const total = COLLEGE_POPULATIONS[colName] || 1000;
        const pct = total > 0 ? Math.round((voted / total) * 100 * 10) / 10 : 0;
        return { name: colName, pct, voted, total, color: COLLEGE_COLORS[colName] || C.green };
      })
      .sort((a, b) => b.pct - a.pct);

    const overallTotalVoters = collegeStats.reduce((sum, c) => sum + c.total, 0) || 5255;
    const overallPct = overallTotalVoters > 0 ? Math.round((overallVoted / overallTotalVoters) * 100 * 10) / 10 : 0;

    return {
      totalVoters: overallTotalVoters,
      totalVoted: overallVoted,
      asOf: new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
      colleges: collegeStats,
      overallPct,
    };
  }, [positions, C.green]);

  if (!activeCycleId) return null;

  if (isLoading) {
    return (
      <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 32, alignItems: 'center' }}>
        <ActivityIndicator size="small" color={C.green} />
      </View>
    );
  }

  if (!stats) return null;

  const { totalVoters, totalVoted, asOf, colleges, overallPct } = stats;
  const topCollege = colleges[0];
  const rest       = colleges.slice(1);

  const rows: typeof rest[] = [];
  for (let i = 0; i < rest.length; i += 2) rows.push(rest.slice(i, i + 2));

  return (
    <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Text style={[S.shared.sectionTitle, { flex: 1 }]}>Voter Turnout</Text>
        <View style={S.live.livePill}>
          <View style={S.live.liveDot} />
          <Text style={S.live.livePillText}>LIVE</Text>
        </View>
      </View>

      <View style={[S.shared.card, { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 10 }]}>
        <View style={{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center' }}>
          <DonutRing pct={overallPct} size={80} stroke={10} />
          <View style={{ position: 'absolute', alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.green }}>{overallPct}%</Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 10, color: C.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
            SG Elections 2025–2026
          </Text>
          <Text style={{ fontSize: 11, color: C.textMuted, marginBottom: 8 }}>As of {asOf}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: C.green }}>{overallPct}%</Text>
            <Text style={{ fontSize: 13, color: C.textMuted }}>
              {totalVoted.toLocaleString()} / {totalVoters.toLocaleString()}
            </Text>
          </View>
        </View>
      </View>

      {topCollege && (
        <View style={[S.shared.card, { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, borderColor: C.green, borderWidth: 1.5 }]}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.green }}>{topCollege.name[0]}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 }}>{topCollege.name}</Text>
            <Text style={{ fontSize: 11, color: C.textMuted, marginBottom: 6 }}>
              {topCollege.pct}% participation · {topCollege.voted.toLocaleString()} / {topCollege.total.toLocaleString()}
            </Text>
            <View style={{ backgroundColor: C.border, borderRadius: 4, height: 5, overflow: 'hidden' }}>
              <View style={{ width: `${topCollege.pct}%`, height: '100%', backgroundColor: C.green, borderRadius: 4 }} />
            </View>
          </View>
          <View style={{ backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.green }}>#1</Text>
            <Text style={{ fontSize: 9, color: C.green, textAlign: 'center', marginTop: 1 }}>Most{'\n'}Engaged</Text>
          </View>
        </View>
      )}

      {rows.map((pair, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: 10 }}>
          {pair.map((col, ci) => {
            const rank = ri * 2 + ci + 2;
            return (
              <View key={col.name} style={[S.shared.card, { flex: 1, gap: 6 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: col.color + '22', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: col.color }}>{col.name[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: C.text }} numberOfLines={1}>{col.name}</Text>
                    <Text style={{ fontSize: 10, color: C.textMuted }}>{col.pct}%</Text>
                  </View>
                  <View style={{ backgroundColor: C.surface, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: C.textMuted }}>#{rank}</Text>
                  </View>
                </View>
                <View style={{ backgroundColor: C.border, borderRadius: 3, height: 4, overflow: 'hidden' }}>
                  <View style={{ width: `${col.pct}%`, height: '100%', backgroundColor: col.color, borderRadius: 3 }} />
                </View>
                <Text style={{ fontSize: 10, color: C.textMuted }}>{col.voted.toLocaleString()} / {col.total.toLocaleString()}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
};

// =============================================================================
// POLL VOTER COMPONENT
// =============================================================================

const PollVoter: React.FC<{ post: RawPost; userId: string | null }> = ({ post, userId }) => {
  const C = useThemeColors();

  const pStyles = useMemo(() => StyleSheet.create({
    optionBtn: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 11, paddingHorizontal: 14, marginBottom: 8,
      borderRadius: 10, backgroundColor: C.surface,
      borderWidth: 1, borderColor: C.border,
    },
    optionRadio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: C.textMuted, marginRight: 10 },
    optionText:   { color: C.text, fontSize: 14, flex: 1 },
    resultRow:    { marginBottom: 12 },
    resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
    resultLabel:  { color: C.text, fontSize: 13, fontWeight: '500', flex: 1 },
    resultPct:    { color: C.textMuted, fontSize: 13, fontWeight: '600', marginLeft: 8 },
    barTrack:     { height: 6, backgroundColor: C.surface, borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
    barFill:      { height: 6, borderRadius: 4, backgroundColor: C.border },
    resultCount:  { fontSize: 11, color: C.textMuted },
    totalText:    { fontSize: 11, color: C.textMuted, marginTop: 4 },
  }), [C]);

  const { data, isLoading, isError } = usePollResponses(post.id, userId);
  const { mutateAsync: submitVote, isPending: isSubmitting } = useSubmitPollResponse(post.id);
  const [pendingOptionId, setPendingOptionId] = useState<string | null>(null);

  const hasVoted   = data?.hasVoted   ?? false;
  const myOptionId = data?.myOptionId ?? pendingOptionId;
  const options    = data?.options    ?? [];
  const totalVotes = options.reduce((sum, o) => sum + o.responseCount, 0);
  const showResults = hasVoted || !!pendingOptionId;

  const handleVote = async (optionId: string) => {
    if (!userId) { Alert.alert('Not signed in', 'You must be signed in to vote.'); return; }
    if (hasVoted || pendingOptionId) return;
    setPendingOptionId(optionId);
    try {
      await submitVote({ pollOptionId: optionId, studentId: userId });
    } catch (e: any) {
      setPendingOptionId(null);
      if (e?.code === '23505') {
        Alert.alert('Already voted', 'You have already responded to this poll.');
      } else {
        Alert.alert('Error', e?.message ?? 'Could not submit your vote. Please try again.');
      }
    }
  };

  if (isLoading) {
    return (
      <View style={{ paddingVertical: 20, alignItems: 'center' }}>
        <ActivityIndicator size="small" color={C.green} />
      </View>
    );
  }

  if (isError || options.length === 0) {
    return (
      <View style={{ paddingVertical: 12 }}>
        <Text style={{ color: C.textMuted, fontSize: 13 }}>
          {isError ? 'Could not load poll options.' : 'No options available.'}
        </Text>
      </View>
    );
  }

  const maxCount = Math.max(...options.map(o => o.responseCount), 1);

  return (
    <View style={{ marginBottom: 12 }}>
      {options.map(opt => {
        const isMyVote  = opt.id === myOptionId;
        const pct       = totalVotes > 0 ? Math.round((opt.responseCount / totalVotes) * 100) : 0;
        const isLeading = opt.responseCount > 0 && opt.responseCount === maxCount;

        if (showResults) {
          return (
            <View key={opt.id} style={pStyles.resultRow}>
              <View style={pStyles.resultHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  {isMyVote && <Ionicons name="checkmark-circle" size={14} color={C.green} style={{ marginRight: 5 }} />}
                  <Text style={[pStyles.resultLabel, isMyVote && { color: C.green }]} numberOfLines={1}>{opt.option_text}</Text>
                </View>
                <Text style={[pStyles.resultPct, isLeading && { color: C.green, fontWeight: '700' }]}>{pct}%</Text>
              </View>
              <View style={pStyles.barTrack}>
                <View style={[pStyles.barFill, { width: `${pct}%` }, isMyVote && { backgroundColor: 'rgba(27,98,53,0.30)' }, isLeading && { backgroundColor: C.green }]} />
              </View>
              <Text style={pStyles.resultCount}>{opt.responseCount} {opt.responseCount === 1 ? 'response' : 'responses'}</Text>
            </View>
          );
        }

        return (
          <Pressable
            key={opt.id}
            style={({ pressed }) => [pStyles.optionBtn, !isSubmitting && pressed && { opacity: 0.7 }]}
            onPress={() => handleVote(opt.id)}
            disabled={isSubmitting}
          >
            {isSubmitting && pendingOptionId === opt.id
              ? <ActivityIndicator size={14} color={C.green} style={{ marginRight: 10 }} />
              : <View style={pStyles.optionRadio} />
            }
            <Text style={pStyles.optionText}>{opt.option_text}</Text>
          </Pressable>
        );
      })}
      <Text style={pStyles.totalText}>
        {totalVotes} {totalVotes === 1 ? 'response' : 'responses'}
        {showResults ? ' · Refreshes every 15s' : ''}
      </Text>
    </View>
  );
};

// =============================================================================
// POST CARD — COMMENT ROW
// ✅ CHANGE: Added userName prop — replaces hardcoded "AN" in reply input avatar
// =============================================================================

const CommentRow: React.FC<{
  comment:  CommentType;
  userId:   string | null;
  userName: string;           // ← NEW
  postId:   string;
  depth?:   number;
}> = ({ comment, userId, userName, postId, depth = 0 }) => {
  const C = useThemeColors();
  const S = useMemo(() => makeStyles(C), [C]);

  const [replyVisible, setReplyVisible] = useState(false);
  const [replyDraft, setReplyDraft]     = useState('');
  const { mutateAsync: createComment, isPending: isSending } = useCreateComment(postId);
  const { mutateAsync: deleteComment } = useDeleteComment(postId);
  const isOwn = userId === comment.student_id;

  const handleReply = async () => {
    const trimmed = replyDraft.trim();
    if (!trimmed || !userId) return;
    try {
      await createComment({ content: trimmed, studentId: userId, parentId: comment.id });
      setReplyDraft('');
      setReplyVisible(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not post reply.');
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Comment', 'Remove this comment?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteComment(comment.id) },
    ]);
  };

  return (
    <View style={{ marginLeft: depth > 0 ? 28 : 0, marginBottom: 10 }}>
      <View style={S.feed.comment}>
        <View style={S.feed.commentAvatar}>
          <Text style={S.feed.commentAvatarText}>{comment.authorInitials}</Text>
        </View>
        <View style={[S.feed.commentBubble, { flex: 1 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={S.feed.commentUser}>{comment.authorName}</Text>
            <Text style={{ fontSize: 10, color: C.textMuted }}>{timeAgo(comment.created_at)}</Text>
          </View>
          <Text style={S.feed.commentText}>{comment.content}</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
            {depth === 0 && (
              <Pressable onPress={() => setReplyVisible(v => !v)} style={({ pressed }) => pressed && { opacity: 0.7 }}>
                <Text style={{ fontSize: 11, color: C.green, fontWeight: '600' }}>
                  {replyVisible ? 'Cancel' : 'Reply'}
                </Text>
              </Pressable>
            )}
            {isOwn && (
              <Pressable onPress={handleDelete} style={({ pressed }) => pressed && { opacity: 0.7 }}>
                <Text style={{ fontSize: 11, color: C.textMuted }}>Delete</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {replyVisible && (
        <View style={[S.feed.commentInput, { marginLeft: 28, marginTop: 6 }]}>
          {/* ✅ CHANGE: Real initials instead of hardcoded "AN" */}
          <View style={S.feed.commentAvatar}>
            <Text style={S.feed.commentAvatarText}>{userName ? toInitials(userName) : 'AN'}</Text>
          </View>
          <View style={S.feed.commentInputBox}>
            <TextInput
              style={S.feed.commentInputText}
              placeholder="Write a reply…"
              placeholderTextColor={C.textMuted}
              value={replyDraft}
              onChangeText={setReplyDraft}
              multiline
              autoFocus
            />
          </View>
          <Pressable
            style={({ pressed }) => [S.feed.commentSendBtn, !isSending && pressed && { opacity: 0.85 }]}
            onPress={handleReply}
            disabled={isSending}
          >
            {isSending
              ? <ActivityIndicator size={12} color={C.green} />
              : <Text style={{ fontSize: 14, color: '#fff' }}>↑</Text>
            }
          </Pressable>
        </View>
      )}

      {/* ✅ CHANGE: Pass userName down to nested replies */}
      {comment.replies.map((reply, idx) => (
        <View key={reply.id} style={{ marginTop: idx === 0 ? 8 : 6 }}>
          <CommentRow comment={reply} userId={userId} userName={userName} postId={postId} depth={1} />
        </View>
      ))}
    </View>
  );
};

// =============================================================================
// POST CARD
// ✅ CHANGE: Added userName prop — passes to CommentRow + fixes main input avatar
// =============================================================================

const PostCard: React.FC<{
  post:     RawPost;
  userId:   string | null;
  userName: string;           // ← NEW
}> = ({ post, userId, userName }) => {
  const C = useThemeColors();
  const S = useMemo(() => makeStyles(C), [C]);

  const [commentsVisible, setCommentsVisible] = useState(false);
  const [draftComment, setDraftComment]       = useState('');

  const authorLabel    = 'DLSL COMELEC';
  const authorInitials = toInitials(authorLabel);
  const roleLabel      = 'Official';

  const { data: likesData } = useLikes(post.id, userId);
  const { mutateAsync: toggleLike, isPending: isTogglingLike } = useToggleLike(post.id);

  const likeCount = likesData?.count    ?? 0;
  const hasLiked  = likesData?.hasLiked ?? false;
  const myLikeId  = likesData?.myLikeId ?? null;

  const handleLike = async () => {
    if (!userId) { Alert.alert('Not signed in', 'You must be signed in to like posts.'); return; }
    try {
      await toggleLike({ studentId: userId, hasLiked, myLikeId });
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not update like.');
    }
  };

  const { data: comments = [], isLoading: commentsLoading } = useComments(post.id);
  const { mutateAsync: createComment, isPending: isSendingComment } = useCreateComment(post.id);

  const totalCommentCount = comments.reduce((sum, c) => sum + 1 + c.replies.length, 0);

  const handleSubmitComment = async () => {
    const trimmed = draftComment.trim();
    if (!trimmed || !userId) return;
    try {
      await createComment({ content: trimmed, studentId: userId });
      setDraftComment('');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not post comment.');
    }
  };

  return (
    <View style={S.feed.postCard}>
      <View style={S.feed.postHeader}>
        <View style={S.feed.avatar}>
          <Text style={S.feed.avatarText}>{authorInitials}</Text>
        </View>
        <View style={S.feed.postMeta}>
          <Text style={S.feed.postAuthor}>{authorLabel}</Text>
          <Text style={S.feed.postTime}>{roleLabel} · {timeAgo(post.created_at)}</Text>
        </View>
        <View style={[S.shared.badge, { backgroundColor: post.type === 'poll' ? C.surface2 : C.surface }]}>
          <Text style={[S.shared.badgeText, { color: post.type === 'poll' ? C.green : C.textMuted }]}>
            {post.type === 'poll' ? 'Poll' : 'Notice'}
          </Text>
        </View>
      </View>

      {post.title ? <Text style={S.feed.postTitle}>{post.title}</Text> : null}
      {post.type === 'announcement' && post.content
        ? <Text style={S.feed.postBody}>{post.content}</Text>
        : null}
      {post.type === 'poll' ? <PollVoter post={post} userId={userId} /> : null}

      <View style={S.feed.postActions}>
        <Pressable
          style={({ pressed }) => [S.feed.postAction, !isTogglingLike && pressed && { opacity: 0.75 }]}
          onPress={handleLike}
          disabled={isTogglingLike}
        >
          <Ionicons name={hasLiked ? 'heart' : 'heart-outline'} size={18} color={hasLiked ? C.green : C.textSub} />
          <Text style={S.feed.postActionText}>{likeCount}</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [S.feed.postAction, pressed && { opacity: 0.75 }]}
          onPress={() => setCommentsVisible(v => !v)}
        >
          <Ionicons name="chatbubble-outline" size={18} color={C.textSub} />
          <Text style={S.feed.postActionText}>
            {totalCommentCount} {totalCommentCount === 1 ? 'Comment' : 'Comments'}
          </Text>
        </Pressable>
      </View>

      {commentsVisible && (
        <View style={S.feed.commentSection}>
          {commentsLoading ? (
            <ActivityIndicator size="small" color={C.green} style={{ marginVertical: 12 }} />
          ) : comments.length === 0 ? (
            <Text style={{ color: C.textMuted, fontSize: 12, marginBottom: 10 }}>
              No comments yet. Be the first!
            </Text>
          ) : (
            // ✅ CHANGE: Pass userName to CommentRow
            comments.map(c => (
              <CommentRow key={c.id} comment={c} userId={userId} userName={userName} postId={post.id} />
            ))
          )}

          <View style={S.feed.commentInput}>
            {/* ✅ CHANGE: Real initials instead of hardcoded "AN" */}
            <View style={S.feed.commentAvatar}>
              <Text style={S.feed.commentAvatarText}>{userName ? toInitials(userName) : 'AN'}</Text>
            </View>
            <View style={S.feed.commentInputBox}>
              <TextInput
                style={S.feed.commentInputText}
                placeholder="Add a comment…"
                placeholderTextColor={C.textMuted}
                value={draftComment}
                onChangeText={setDraftComment}
                multiline
              />
            </View>
            <Pressable
              style={({ pressed }) => [S.feed.commentSendBtn, !isSendingComment && pressed && { opacity: 0.85 }]}
              onPress={handleSubmitComment}
              disabled={isSendingComment}
            >
              {isSendingComment
                ? <ActivityIndicator size={12} color={C.green} />
                : <Text style={{ fontSize: 14, color: '#fff' }}>↑</Text>
              }
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
};

// =============================================================================
// ANNOUNCEMENT FEED
// ✅ CHANGE: Added userName prop — passes to PostCard
// =============================================================================

type FeedTab = 'all' | 'announcements' | 'polls';

const FEED_TABS: { key: FeedTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all',           label: 'All',     icon: 'layers-outline'    },
  { key: 'announcements', label: 'Notices', icon: 'megaphone-outline' },
  { key: 'polls',         label: 'Polls',   icon: 'bar-chart-outline' },
];

const AnnouncementFeed: React.FC<{
  userId:   string | null;
  userName: string;           // ← NEW
}> = ({ userId, userName }) => {
  const C = useThemeColors();
  const S = useMemo(() => makeStyles(C), [C]);

  const [activeTab, setActiveTab] = useState<FeedTab>('all');
  const activeCycleId = useAuthStore(state => state.activeCycleId);
  const { data: rawPosts, isLoading, isError, error } = usePosts(activeCycleId);

  const filteredPosts = ((rawPosts ?? []) as RawPost[]).filter(post => {
    if (activeTab === 'all')           return true;
    if (activeTab === 'announcements') return post.type === 'announcement';
    if (activeTab === 'polls')         return post.type === 'poll';
    return true;
  });

  return (
    <View>
      <View style={S.feed.tabRow}>
        {FEED_TABS.map(tab => (
          <Pressable
            key={tab.key}
            style={({ pressed }) => [
              S.feed.tab,
              activeTab === tab.key && S.feed.tabActive,
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons
              name={tab.icon}
              size={16}
              color={activeTab === tab.key ? C.green : C.textMuted}
              style={{ marginRight: 6 }}
            />
            <Text style={[S.feed.tabText, activeTab === tab.key && S.feed.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {!activeCycleId && (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <Ionicons name="file-tray-outline" size={32} color={C.textMuted} />
          <Text style={{ color: C.textMuted, marginTop: 12, fontSize: 13, textAlign: 'center' }}>
            No active election cycle is available yet.
          </Text>
        </View>
      )}

      {activeCycleId && isLoading && (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator size="large" color={C.green} />
          <Text style={{ color: C.textMuted, marginTop: 12, fontSize: 13 }}>Loading posts…</Text>
        </View>
      )}

      {activeCycleId && isError && (
        <View style={{ paddingVertical: 32, alignItems: 'center', paddingHorizontal: 24 }}>
          <Ionicons name="cloud-offline-outline" size={32} color={C.textMuted} />
          <Text style={{ color: C.textMuted, marginTop: 12, fontSize: 13, textAlign: 'center' }}>
            Could not load posts.{'\n'}{(error as Error)?.message ?? 'Please try again.'}
          </Text>
        </View>
      )}

      {activeCycleId && !isLoading && !isError && filteredPosts.length === 0 && (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <Ionicons name="file-tray-outline" size={32} color={C.textMuted} />
          <Text style={{ color: C.textMuted, marginTop: 12, fontSize: 13 }}>No posts yet.</Text>
        </View>
      )}

      {/* ✅ CHANGE: Pass userName to PostCard */}
      {activeCycleId && !isLoading && !isError && filteredPosts.map(post => (
        <PostCard key={post.id} post={post} userId={userId} userName={userName} />
      ))}
    </View>
  );
};

// =============================================================================
// MAIN SCREEN
// ✅ CHANGES:
//   - Added userName state
//   - resolveUser fetches name from Users table alongside auth id
//   - userName passed through renderSection → AnnouncementFeed
// =============================================================================

type SectionKey = 'countdown' | 'live' | 'feed';
const SECTIONS: { type: SectionKey }[] = [
  { type: 'countdown' },
  { type: 'live' },
  { type: 'feed' },
];

export default function DashboardScreen() {
  const C = useThemeColors();
  const S = useMemo(() => makeStyles(C), [C]);
  const isDark      = useThemeStore(s => s.isDark);
  const toggleTheme = useThemeStore(s => s.toggleTheme);

  // ✅ CHANGE: Added userName alongside userId
  const [userId,       setUserId]       = useState<string | null>(null);
  const [userName,     setUserName]     = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey,   setRefreshKey]   = useState(0);
  const { settings } = useSettings();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshKey(k => k + 1);
    await new Promise(res => setTimeout(res, 800));
    setIsRefreshing(false);
  };

  // ✅ CHANGE: resolveUser fetches name from public.Users using auth_id
  useEffect(() => {
    const resolveUser = async (authId: string | null) => {
      setUserId(authId);
      if (authId) {
        const { data: profile } = await supabase
          .from('Users')
          .select('name')
          .eq('auth_id', authId)
          .single();
        setUserName(profile?.name ?? '');
      } else {
        setUserName('');
      }
    };

    supabase.auth.getUser().then(({ data }) => resolveUser(data.user?.id ?? null));

    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      resolveUser(session?.user?.id ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const renderSection = ({ item }: { item: { type: SectionKey } }) => {
    switch (item.type) {
      case 'countdown':
        return <VotingCountdown />;

      case 'live':
        if (settings !== null && settings.show_live_results === false) return null;
        return (
          <>
            <Text style={[S.shared.sectionTitle, { marginBottom: 12 }]}>Live Voting</Text>
            <LiveVotingBoard />
          </>
        );

      case 'feed':
        return (
          <View style={{ marginTop: 8 }}>
            {/* ✅ CHANGE: Pass userName to AnnouncementFeed */}
            <AnnouncementFeed userId={userId} userName={userName} />
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={S.screen.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.bg} />
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={S.screen.header}>
          <View>
            <Text style={S.screen.headerLogoText}>AnimoQuorum</Text>
            <Text style={S.screen.headerSub}>DLSL COMELEC · SY 2025–2026</Text>
          </View>
          <View style={S.screen.profileHeader}>
            <Pressable
              onPress={handleRefresh}
              disabled={isRefreshing}
              style={({ pressed }) => [{ marginRight: 12, padding: 4 }, !isRefreshing && pressed && { opacity: 0.7 }]}
            >
              {isRefreshing
                ? <ActivityIndicator size={18} color={C.green} />
                : <Ionicons name="refresh-outline" size={20} color={C.text} />
              }
            </Pressable>
            <Pressable onPress={toggleTheme} style={({ pressed }) => [{ paddingLeft: 12, paddingRight: 4 }, pressed && { opacity: 0.7 }]}>
              <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={20} color={C.text} />
            </Pressable>
          </View>
        </View>
        <KeyboardAwareFlatList
          key={refreshKey}
          data={SECTIONS}
          keyExtractor={item => item.type}
          renderItem={renderSection}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1, backgroundColor: C.bg }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          enableOnAndroid
          enableAutomaticScroll
          viewIsInsideTabBar
          extraScrollHeight={56}
          keyboardOpeningTime={0}
          contentContainerStyle={[S.screen.scrollContent, { flexGrow: 1 }]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={C.green}
              colors={[C.green]}
            />
          }
        />
      </View>
    </SafeAreaView>
  );
}

export { DashboardScreen };
