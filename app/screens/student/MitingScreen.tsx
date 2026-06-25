/**
 * MitingScreen.tsx — Reddit-style live Q&A for Miting de Avance
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, Pressable, FlatList,
  TextInput, StyleSheet, ActivityIndicator,
  Animated, StatusBar, Platform, Alert, RefreshControl,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons }         from '@expo/vector-icons';
import { useMitingQuestions, useStudentUpvotes, useUpvoteQuestion, useRemoveUpvote, useSubmitQuestion } from '../../hooks/useMiting';
import { useAuthStore }     from '../../stores/authStore';
import { notifyAdminAlert } from '../../notifications/notificationService';
import { useThemeColors, ThemeColors } from '../../theme';
import { useThemeStore }    from '../../stores/themeStore';
import { useSettings }      from '../../hooks/useSettings';

interface Question {
  id: string; question_text: string; upvote_count: number;
  student_id: string; is_approved: boolean; created_at: string;
}

// ─── QuestionCard ─────────────────────────────────────────────────────────────
function QuestionCard({ q, index, totalCount, hasUpvoted, onUpvote, userId, C, s }: {
  q: Question; index: number; totalCount: number;
  hasUpvoted: boolean; onUpvote: (id: string) => void;
  userId: string;
  C: ThemeColors;
  s: ReturnType<typeof makeStyles>;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const isTop = index === 0 && totalCount > 1 && q.is_approved;
  const isOwn = q.student_id === userId;

  const handlePress = () => {
    // Prevent upvoting pending questions
    if (!q.is_approved) return;
    
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.35, duration: 100, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }),
    ]).start();
    onUpvote(q.id);
  };

  return (
    <View style={[s.questionCard, isTop && s.questionCardTop]}>
      <Pressable
        style={({ pressed }) => [
          s.upvoteBtn,
          hasUpvoted && s.upvoteBtnActive,
          !q.is_approved && { opacity: 0.5 },
          q.is_approved && pressed && { opacity: 0.7 },
        ]}
        onPress={handlePress}
        disabled={!q.is_approved}
      >
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <Ionicons
            name={hasUpvoted ? 'arrow-up-circle' : 'arrow-up-circle-outline'}
            size={22} color={hasUpvoted ? C.greenBright : C.textMuted}
          />
        </Animated.View>
        <Text style={[s.upvoteCount, hasUpvoted && { color: C.greenBright }]}>{q.upvote_count}</Text>
      </Pressable>

      <View style={{ flex: 1 }}>
        {isTop && <View style={s.topBadge}><Text style={s.topBadgeText}>🔥 Top Question</Text></View>}
        {!q.is_approved && <View style={s.pendingBadge}><Text style={s.pendingBadgeText}>⏳ Pending Approval</Text></View>}
        
        <Text style={s.questionText}>{q.question_text}</Text>
        
        <View style={s.questionFooter}>
          <Text style={s.questionMeta}>
            {new Date(q.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {isOwn && <View style={s.youBadge}><Text style={s.youBadgeText}>You</Text></View>}
        </View>
      </View>
    </View>
  );
}

export function MitingScreen() {
  const C      = useThemeColors();
  const isDark = useThemeStore(st => st.isDark);
  const tabBarHeight = useBottomTabBarHeight();
  const s      = useMemo(() => makeStyles(C), [C]);

  const { userProfile, activeCycleId } = useAuthStore();
  const userId = userProfile?.id ?? '';
  const { settings } = useSettings();

  // Pass userId to fetch their specific pending questions
  const { data: questions, isLoading, refetch } = useMitingQuestions(userId) as { data: Question[] | undefined, isLoading: boolean, refetch: () => Promise<any> };
  const { data: remoteUpvotes } = useStudentUpvotes(userId);
  
  const { mutateAsync: upvote }         = useUpvoteQuestion();
  const { mutateAsync: removeUpvote }   = useRemoveUpvote();
  const { mutateAsync: submitQuestion } = useSubmitQuestion();

  const [draft,          setDraft]        = useState('');
  const [submitting,     setSubmitting]   = useState(false);
  const [upvotedIds,     setUpvotedIds]   = useState<Set<string>>(new Set());
  const [showToast,      setShowToast]    = useState(false);
  const [isRefreshing,   setIsRefreshing] = useState(false);
  // Miting activity is cycle-owned through ElectionCycles.is_miting_active.
  const isMitingActive = !!activeCycleId && !!settings?.is_miting_active;
  const previousMitingActive = useRef(isMitingActive);

  const inputRef  = useRef<TextInput>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Sync historical upvotes from the DB on load
  useEffect(() => {
    if (remoteUpvotes) setUpvotedIds(new Set(remoteUpvotes));
  }, [remoteUpvotes]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.2, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (!previousMitingActive.current && isMitingActive) {
      notifyAdminAlert('Miting de Avance is now live! Submit your questions.');
    }
    previousMitingActive.current = isMitingActive;
  }, [isMitingActive]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const handleSubmit = async () => {
    const text = draft.trim();
    if (!text || !userId) return;
    setSubmitting(true);
    try {
      await submitQuestion({ questionText: text, studentId: userId });
      setDraft(''); 
      inputRef.current?.blur();
      setShowToast(true); 
      setTimeout(() => setShowToast(false), 3000);
    } catch (error: any) {
      Alert.alert('Submission Failed', error?.message || 'Could not submit your question. Please try again.');
    } finally { 
      setSubmitting(false); 
    }
  };

  const handleUpvote = async (questionId: string) => {
    if (!userId) return;
    const hasUpvoted = upvotedIds.has(questionId);
    
    // Optimistic UI update
    setUpvotedIds(prev => { const n = new Set(prev); hasUpvoted ? n.delete(questionId) : n.add(questionId); return n; });
    
    try {
      if (hasUpvoted) await removeUpvote({ questionId, studentId: userId });
      else            await upvote({ questionId, studentId: userId });
    } catch {
      // Revert on failure
      setUpvotedIds(prev => { const n = new Set(prev); hasUpvoted ? n.add(questionId) : n.delete(questionId); return n; });
    }
  };

  const charColor = draft.length >= 265 ? C.red : draft.length >= 250 ? C.amber : C.textMuted;
  const qCount    = questions?.length ?? 0;
  const qLabel    = qCount === 1 ? '1 question' : `${qCount} questions`;

  if (!isMitingActive) {
    const inactiveTitle = activeCycleId ? 'Not Live Yet' : 'No Active Election';
    const inactiveBody = activeCycleId
      ? "Miting de Avance hasn't started.\nYou'll get a notification when it goes live."
      : "No active election cycle is available yet.\nMiting questions will open with the active cycle.";

    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.bg} />
        <View style={s.center}>
          <View style={s.inactiveIcon}><Ionicons name="mic-off-outline" size={40} color={C.textMuted} /></View>
          <Text style={s.inactiveTitle}>{inactiveTitle}</Text>
          <Text style={s.inactiveBody}>{inactiveBody}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.bg} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={{ flex: 1 }}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.livePill}>
            <Animated.View style={[s.liveDot, { opacity: pulseAnim }]} />
            <Text style={s.livePillText}>LIVE</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.headerTitle}>Miting de Avance</Text>
            <Text style={s.headerSub}>Upvote the questions you want answered</Text>
          </View>
          <View style={s.questionCountBadge}><Text style={s.questionCountText}>{qLabel}</Text></View>
        </View>

        {/* ── Questions list ── */}
        {isLoading && !isRefreshing ? (
          <View style={s.center}><ActivityIndicator size="large" color={C.greenBright} /></View>
        ) : (
          <FlatList
            data={questions ?? []} keyExtractor={item => item.id}
            style={{ flex: 1 }}
            contentContainerStyle={[s.list, { paddingBottom: tabBarHeight + 8 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={C.green} colors={[C.green]} />}
            ListEmptyComponent={
              <View style={s.emptyState}>
                <Ionicons name="chatbubble-ellipses-outline" size={36} color={C.textMuted} />
                <Text style={s.emptyTitle}>No questions yet</Text>
                <Text style={s.emptyBody}>Be the first to submit one below.</Text>
              </View>
            }
            renderItem={({ item: q, index }) => (
              <QuestionCard
                q={q} index={index} totalCount={questions?.length ?? 0}
                hasUpvoted={upvotedIds.has(q.id)} onUpvote={handleUpvote}
                userId={userId} C={C} s={s}
              />
            )}
          />
        )}

        {/* ── Toast ── */}
        {showToast && (
          <View style={s.toast}>
            <Ionicons name="checkmark-circle" size={16} color={C.greenBright} />
            <Text style={s.toastText}>Question submitted! Waiting for approval.</Text>
          </View>
        )}

        {/* ── Input bar ── */}
        <View style={s.inputBar}>
          <View style={s.inputWrap}>
            <TextInput
              ref={inputRef} style={s.input} value={draft} onChangeText={setDraft}
              placeholder="Ask the candidates something…" placeholderTextColor={C.textMuted}
              multiline maxLength={280} returnKeyType="send" onSubmitEditing={handleSubmit}
            />
            <Text style={[s.charCount, { color: charColor }]}>{draft.length}/280</Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              s.sendBtn,
              (!draft.trim() || submitting) && s.sendBtnDisabled,
              draft.trim() && !submitting && pressed && { opacity: 0.85 },
            ]}
            onPress={handleSubmit}
            disabled={!draft.trim() || submitting}
          >
            {submitting
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="send" size={18} color="#fff" />
            }
          </Pressable>
        </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: C.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },

    inactiveIcon:  { width: 80, height: 80, borderRadius: 40, backgroundColor: C.surface2,
                     alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: C.border },
    inactiveTitle: { fontSize: 20, fontWeight: '800', color: C.text },
    inactiveBody:  { fontSize: 14, color: C.textMuted, textAlign: 'center', lineHeight: 22, marginTop: 8 },

    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
    livePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.redGlow, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
    liveDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: C.red },
    livePillText: { fontSize: 10, fontWeight: '800', color: C.red, letterSpacing: 1 },
    headerTitle:  { fontSize: 15, fontWeight: '800', color: C.text },
    headerSub:    { fontSize: 11, color: C.textMuted, marginTop: 1 },

    questionCountBadge: { backgroundColor: C.surface2, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 9, paddingVertical: 4 },
    questionCountText:  { fontSize: 11, fontWeight: '700', color: C.textMuted },

    list:       { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 16 },
    emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: C.textSub },
    emptyBody:  { fontSize: 13, color: C.textMuted },

    questionCard: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 12,
      backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border,
      padding: 14, marginBottom: 10,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
    },
    questionCardTop: { borderColor: C.greenBright + '55', backgroundColor: C.surface2 },

    upvoteBtn:       { alignItems: 'center', gap: 3, minWidth: 36, paddingTop: 2 },
    upvoteBtnActive: { backgroundColor: C.greenLight, borderRadius: 10, paddingHorizontal: 4 },
    upvoteCount:     { fontSize: 13, fontWeight: '700', color: C.textMuted },

    topBadge:     { alignSelf: 'flex-start', backgroundColor: C.greenLight, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3, marginBottom: 6 },
    topBadgeText: { fontSize: 11, fontWeight: '700', color: C.greenBright },
    
    pendingBadge:     { alignSelf: 'flex-start', backgroundColor: C.amberGlow, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3, marginBottom: 6, borderWidth: 1, borderColor: C.amber + '55' },
    pendingBadgeText: { fontSize: 11, fontWeight: '700', color: C.amber },

    questionText:   { fontSize: 14, color: C.text, lineHeight: 21, marginBottom: 6 },
    questionFooter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    questionMeta:   { fontSize: 11, color: C.textMuted },

    youBadge:     { backgroundColor: C.greenDim, borderRadius: 8, borderWidth: 1, borderColor: C.greenBright + '55', paddingHorizontal: 7, paddingVertical: 2 },
    youBadgeText: { fontSize: 10, fontWeight: '700', color: C.greenBright },

    toast: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 14, marginBottom: 8,
      backgroundColor: C.surface2, borderRadius: 12, borderWidth: 1, borderColor: C.greenBright + '44',
      paddingHorizontal: 14, paddingVertical: 10,
    },
    toastText: { fontSize: 13, color: C.textSub, flex: 1 },

    inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg },
    inputWrap: { flex: 1, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 },
    input:     { color: C.text, fontSize: 14, maxHeight: 90 },
    charCount: { fontSize: 10, textAlign: 'right', marginTop: 4 },
    sendBtn: {
      width: 44, height: 44, borderRadius: 22, backgroundColor: C.green,
      alignItems: 'center', justifyContent: 'center', marginBottom: 2,
      shadowColor: C.green, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 3,
    },
    sendBtnDisabled: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, shadowOpacity: 0 },
  });
}
