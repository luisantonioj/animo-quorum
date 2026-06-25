/**
 * AdminDashboardScreen.tsx — Admin post & election management
 * ─────────────────────────────────────────────────────────────────────────────
 * Features:
 * - Summary header (total posts, announcement count, poll count)
 * - Filterable list of all posts (All / Notices / Polls tabs)
 * - Create / Edit via bottom sheet modal
 * - Miting tab: Go Live toggle, Live Feed preview, Pending approval queue
 * - Voting tab: Configure election start/end schedules securely
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, {
  useState, useCallback, useMemo, createContext, useContext, useEffect,
} from 'react';
import {
  View, Text, FlatList, Pressable, TextInput, Modal,
  ScrollView, StatusBar, Alert, ActivityIndicator,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePosts, useCreatePost, useUpdatePost, useDeletePost } from '../../hooks/usePosts';
import { useSettings, useUpdateSettings } from '../../hooks/useSettings';
import {
  useCreateElectionCycle,
  useElectionCycles,
  useUpdateElectionCycleStatus,
  type ElectionCycle,
  type ElectionCycleStatus,
} from '../../hooks/useElectionCycles';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../utils/supabase';
import { makeStyles, type AdminDashboardStyles } from './AdminDashboardScreen.styles';
import { useThemeColors } from '../../theme';
import { useThemeStore } from '../../stores/themeStore';
import type { ThemeColors } from '../../theme';
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { CommentsModal } from '../../components/Commentmodal';

// ─── Context ──────────────────────────────────────────────────────────────────

type AdminDashCtx = { C: ThemeColors; s: AdminDashboardStyles };
const AdminDashCtx = createContext<AdminDashCtx>(null as any);
const useAdminDash = () => useContext(AdminDashCtx);

// =============================================================================
// TYPES
// =============================================================================

interface PollOption { id: string; post_id: string; option_text: string }

interface RawPost {
  id: string; admin_id: string; type: 'announcement' | 'poll';
  title: string; content: string; created_at: string;
  PollOptions?: PollOption[];
}

interface MitingQuestion {
  id: string;
  question_text: string;
  upvote_count: number;
  is_approved: boolean;
  created_at: string;
}

type FeedTab = 'all' | 'announcement' | 'poll' | 'miting' | 'voting';

interface ModalState { visible: boolean; mode: 'create' | 'edit'; post: RawPost | null }

interface SavePayload {
  type: 'announcement' | 'poll'; title: string; content: string; pollOptions: string[];
}

// =============================================================================
// HELPERS
// =============================================================================

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'Just now';
}

async function savePollOptions(postId: string, options: string[]): Promise<void> {
  const trimmed = options.map(o => o.trim()).filter(Boolean);
  if (trimmed.length === 0) return;
  const { error: delErr } = await supabase.from('PollOptions').delete().eq('post_id', postId);
  if (delErr) throw delErr;
  const rows = trimmed.map(option_text => ({ post_id: postId, option_text }));
  const { error: insErr } = await supabase.from('PollOptions').insert(rows);
  if (insErr) throw insErr;
}

// =============================================================================
// SUMMARY HEADER
// =============================================================================

const SummaryHeader: React.FC<{ posts: RawPost[] }> = ({ posts }) => {
  const { C, s } = useAdminDash();
  const total = posts.length;
  const announcements = posts.filter(p => p.type === 'announcement').length;
  const polls = posts.filter(p => p.type === 'poll').length;

  const stats = [
    { label: 'Total Posts',    value: total,         color: C.text,  icon: 'layers-outline'    as const },
    { label: 'Announcements',  value: announcements, color: C.amber, icon: 'megaphone-outline' as const },
    { label: 'Polls',          value: polls,         color: C.green, icon: 'bar-chart-outline' as const },
  ];

  return (
    <View style={s.summaryRow}>
      {stats.map(stat => (
        <View key={stat.label} style={s.statCard}>
          <View style={[s.statIcon, { backgroundColor: `${stat.color}22` }]}>
            <Ionicons name={stat.icon} size={16} color={stat.color} />
          </View>
          <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
          <Text style={s.statLabel}>{stat.label}</Text>
        </View>
      ))}
    </View>
  );
};

// =============================================================================
// POST ROW CARD
// =============================================================================

const PostRow: React.FC<{
  post: RawPost;
  commentCount: number;
  onEdit: (post: RawPost) => void;
  onDelete: (id: string) => void;
  onViewComments: (post: RawPost) => void;
  isDeleting: boolean;
}> = ({ post, commentCount, onEdit, onDelete, onViewComments, isDeleting }) => {
  const { C, s } = useAdminDash();
  const isPoll = post.type === 'poll';

  const handleDelete = () => {
    Alert.alert('Delete Post', `"${post.title}" will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(post.id) },
    ]);
  };

  return (
    <View style={s.postRow}>
      <View style={[s.typePill, { backgroundColor: isPoll ? C.greenDim : C.amberGlow }]}>
        <Ionicons
          name={isPoll ? 'bar-chart-outline' : 'megaphone-outline'}
          size={10}
          color={isPoll ? C.green : C.amber}
        />
        <Text style={[s.typePillText, { color: isPoll ? C.green : C.amber }]}>
          {isPoll ? 'Poll' : 'Notice'}
        </Text>
      </View>

      <Text style={s.postRowTitle}>{post.title}</Text>

      {post.type === 'announcement' && post.content
        ? <Text style={s.postRowBody} numberOfLines={2}>{post.content}</Text>
        : null}

      {post.type === 'poll' && post.PollOptions && post.PollOptions.length > 0
        ? (
          <Text style={s.postRowBody}>
            {post.PollOptions.length} option{post.PollOptions.length !== 1 ? 's' : ''}
          </Text>
        )
        : null}

      <View style={s.postRowFooter}>
        <Text style={s.postRowTime}>{timeAgo(post.created_at)}</Text>
        <View style={s.postRowActions}>

          {/* ── Comments button ── */}
          <Pressable
            style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.7 }]}
            onPress={() => onViewComments(post)}
          >
            <Ionicons name="chatbubble-outline" size={12} color={C.textSub} />
            <Text style={s.actionBtnText}>
              {commentCount > 0 ? `${commentCount} Comment${commentCount !== 1 ? 's' : ''}` : 'Comments'}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.7 }]}
            onPress={() => onEdit(post)}
          >
            <Ionicons name="pencil-outline" size={12} color={C.textSub} />
            <Text style={s.actionBtnText}>Edit</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [s.actionBtn, s.actionBtnDanger, !isDeleting && pressed && { opacity: 0.7 }]}
            onPress={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting
              ? <ActivityIndicator size={12} color={C.red} />
              : <Ionicons name="trash-outline" size={12} color={C.red} />}
            <Text style={[s.actionBtnText, { color: C.red }]}>Delete</Text>
          </Pressable>

        </View>
      </View>
    </View>
  );
};

// =============================================================================
// CREATE / EDIT MODAL
// =============================================================================

const EMPTY_FORM = { type: 'announcement' as 'announcement' | 'poll', title: '', content: '' };

const PostModal: React.FC<{
  state: ModalState; onClose: () => void;
  onSave: (payload: SavePayload, id?: string) => void; isSaving: boolean;
}> = ({ state, onClose, onSave, isSaving }) => {
  const { C, s } = useAdminDash();
  const [form, setForm] = useState(EMPTY_FORM);
  const [pollOptions, setPollOptions] = useState(['', '']);

  React.useEffect(() => {
    if (state.visible && state.post) {
      setForm({ type: state.post.type, title: state.post.title, content: state.post.content ?? '' });
      const existing = state.post.PollOptions?.map(o => o.option_text) ?? [];
      setPollOptions(existing.length >= 2 ? existing : [...existing, ...Array(2 - existing.length).fill('')]);
    } else if (state.visible && !state.post) {
      setForm(EMPTY_FORM);
      setPollOptions(['', '']);
    }
  }, [state.visible, state.post]);

  const addOption    = () => setPollOptions(prev => [...prev, '']);
  const removeOption = (i: number) => setPollOptions(prev => prev.filter((_, idx) => idx !== i));
  const updateOption = (i: number, val: string) =>
    setPollOptions(prev => prev.map((o, idx) => (idx === i ? val : o)));

  const handleSave = () => {
    if (!form.title.trim()) {
      Alert.alert('Missing title', 'Please enter a title before saving.');
      return;
    }
    if (form.type === 'poll' && pollOptions.filter(o => o.trim()).length < 2) {
      Alert.alert('Not enough options', 'A poll needs at least 2 options.');
      return;
    }
    onSave({ ...form, pollOptions }, state.post?.id);
  };

  const isEdit = state.mode === 'edit';

  return (
    <Modal visible={state.visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable style={s.backdrop} onPress={onClose} />
        <View style={s.sheet}>

          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{isEdit ? 'Edit Post' : 'New Post'}</Text>
            <Pressable style={({ pressed }) => [s.sheetClose, pressed && { opacity: 0.75 }]} onPress={onClose}>
              <Ionicons name="close" size={16} color={C.textMuted} />
            </Pressable>
          </View>

          <KeyboardAwareScrollView
            style={{ flex: 1 }}
            contentContainerStyle={s.sheetBody}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            enableOnAndroid
            enableAutomaticScroll
            viewIsInsideTabBar
            extraScrollHeight={48}
            keyboardOpeningTime={0}
          >
            <Text style={s.fieldLabel}>Post Type</Text>
            <View style={s.typeToggle}>
              {(['announcement', 'poll'] as const).map(t => (
                <Pressable
                  key={t}
                  style={({ pressed }) => [
                    s.typeToggleBtn,
                    form.type === t && s.typeToggleBtnActive,
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={() => setForm(f => ({ ...f, type: t }))}
                >
                  <Ionicons
                    name={t === 'poll' ? 'bar-chart-outline' : 'megaphone-outline'}
                    size={14}
                    color={form.type === t ? C.green : C.textMuted}
                  />
                  <Text style={[s.typeToggleBtnText, form.type === t && s.typeToggleBtnTextActive]}>
                    {t === 'poll' ? 'Poll' : 'Announcement'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={s.fieldLabel}>Title</Text>
            <TextInput
              style={s.input}
              placeholder="Enter title…"
              placeholderTextColor={C.textMuted}
              value={form.title}
              onChangeText={v => setForm(f => ({ ...f, title: v }))}
            />

            {form.type === 'announcement' && (
              <>
                <Text style={s.fieldLabel}>Content</Text>
                <TextInput
                  style={[s.input, s.inputMultiline]}
                  placeholder="Enter content…"
                  placeholderTextColor={C.textMuted}
                  value={form.content}
                  onChangeText={v => setForm(f => ({ ...f, content: v }))}
                  multiline
                  numberOfLines={5}
                  textAlignVertical="top"
                />
              </>
            )}

            {form.type === 'poll' && (
              <>
                <Text style={s.fieldLabel}>Poll Options</Text>
                {pollOptions.map((opt, i) => (
                  <View key={i} style={s.pollOptionRow}>
                    <TextInput
                      style={[s.input, { flex: 1, marginBottom: 0 }]}
                      placeholder={`Option ${i + 1}`}
                      placeholderTextColor={C.textMuted}
                      value={opt}
                      onChangeText={v => updateOption(i, v)}
                    />
                    {pollOptions.length > 2 && (
                      <Pressable style={({ pressed }) => [s.pollOptionRemove, pressed && { opacity: 0.75 }]} onPress={() => removeOption(i)}>
                        <Ionicons name="close-circle" size={20} color={C.red} />
                      </Pressable>
                    )}
                  </View>
                ))}
                <Pressable style={({ pressed }) => [s.addOptionBtn, pressed && { opacity: 0.85 }]} onPress={addOption}>
                  <Ionicons name="add-circle-outline" size={16} color={C.green} />
                  <Text style={s.addOptionBtnText}>Add Option</Text>
                </Pressable>
              </>
            )}

            <View style={{ height: 16 }} />
          </KeyboardAwareScrollView>

          <View style={s.sheetFooter}>
            <Pressable
              style={({ pressed }) => [s.saveBtn, !isSaving && pressed && { opacity: 0.85 }]}
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving
                ? <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
                : <Ionicons name="checkmark-circle-outline" size={18} color="#fff" style={{ marginRight: 8 }} />}
              <Text style={s.saveBtnText}>{isEdit ? 'Save Changes' : 'Publish Post'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// =============================================================================
// VOTING CONTROL PANEL (WITH DATE PICKER)
// =============================================================================

const VotingControlPanel: React.FC<{
  settings: any;
  status: string;
  isLoading: boolean;
  isSaving: boolean;
  onSave: (start: string | null, end: string | null) => void;
}> = ({ settings, status, isLoading, isSaving, onSave }) => {
  const { C } = useAdminDash();

  const vs = useMemo(() => ({
    card: {
      backgroundColor: C.surface2, borderRadius: 16, borderWidth: 1,
      borderColor: C.border, padding: 20, marginBottom: 16,
    } as const,
    statusRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 12 },
    dot: { width: 8, height: 8, borderRadius: 4 } as const,
    statusText: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 1.2, textTransform: 'uppercase' as const },
    title: { fontSize: 20, fontWeight: '800' as const, color: C.text, marginBottom: 8 },
    desc: { fontSize: 13, color: C.textSub, lineHeight: 20, marginBottom: 20 },
    label: { fontSize: 12, fontWeight: '700' as const, color: C.textMuted, marginBottom: 6 },
    dateButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      marginBottom: 16,
    },
    dateButtonText: { color: C.text, fontSize: 15, fontWeight: '500' as const },
    dateButtonPlaceholder: { color: C.textMuted, fontSize: 15 },
    saveBtn: {
      flexDirection: 'row' as const, alignItems: 'center' as const,
      justifyContent: 'center' as const, borderRadius: 14, paddingVertical: 15,
      backgroundColor: C.green, marginTop: 8,
    },
    saveBtnText: { fontSize: 15, fontWeight: '700' as const, color: '#fff' },
  }), [C]);

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  const [isStartPickerVisible, setStartPickerVisible] = useState(false);
  const [isEndPickerVisible, setEndPickerVisible] = useState(false);

  useEffect(() => {
    if (settings) {
      setStartDate(settings.voting_start_time ? new Date(settings.voting_start_time) : null);
      setEndDate(settings.voting_end_time ? new Date(settings.voting_end_time) : null);
    }
  }, [settings]);

  const handleSave = () => {
    try {
      const startISO = startDate ? startDate.toISOString() : null;
      const endISO = endDate ? endDate.toISOString() : null;

      if (startDate && endDate && startDate > endDate) {
        Alert.alert('Invalid Schedule', 'End time cannot be before the start time.');
        return;
      }

      onSave(startISO, endISO);
    } catch (e: any) {
      Alert.alert('Validation Error', e.message);
    }
  };

  const formatDisplayDate = (d: Date | null) => {
    if (!d) return 'Not set';
    return d.toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  };

  let statusColor = C.textMuted;
  let statusLabel = 'Unconfigured';
  if (status === 'active') { statusColor = C.green; statusLabel = 'Voting Open Now'; }
  else if (status === 'not_started') { statusColor = C.amber; statusLabel = 'Scheduled'; }
  else if (status === 'ended') { statusColor = '#EF4444'; statusLabel = 'Ended'; }
  if (isLoading) { statusColor = C.textMuted; statusLabel = 'Loading...'; }

  return (
    <View style={vs.card}>
      <View style={vs.statusRow}>
        <View style={[vs.dot, { backgroundColor: statusColor }]} />
        <Text style={[vs.statusText, { color: statusColor }]}>{statusLabel}</Text>
      </View>
      <Text style={vs.title}>Voting Schedule</Text>
      <Text style={vs.desc}>Configure when the election polls officially open and close for students.</Text>

      <Text style={vs.label}>Polls Open</Text>
      <Pressable style={({ pressed }) => [vs.dateButton, pressed && { opacity: 0.8 }]} onPress={() => setStartPickerVisible(true)}>
        <Text style={startDate ? vs.dateButtonText : vs.dateButtonPlaceholder}>
          {formatDisplayDate(startDate)}
        </Text>
        <Ionicons name="calendar-outline" size={18} color={C.textMuted} />
      </Pressable>
      <DateTimePickerModal
        isVisible={isStartPickerVisible}
        mode="datetime"
        date={startDate || new Date()}
        onConfirm={(date) => { setStartDate(date); setStartPickerVisible(false); }}
        onCancel={() => setStartPickerVisible(false)}
        themeVariant={C.bg === '#0A0F0A' ? 'dark' : 'light'}
      />

      <Text style={vs.label}>Polls Close</Text>
      <Pressable style={({ pressed }) => [vs.dateButton, pressed && { opacity: 0.8 }]} onPress={() => setEndPickerVisible(true)}>
        <Text style={endDate ? vs.dateButtonText : vs.dateButtonPlaceholder}>
          {formatDisplayDate(endDate)}
        </Text>
        <Ionicons name="calendar-outline" size={18} color={C.textMuted} />
      </Pressable>
      <DateTimePickerModal
        isVisible={isEndPickerVisible}
        mode="datetime"
        date={endDate || new Date()}
        minimumDate={startDate || undefined}
        onConfirm={(date) => { setEndDate(date); setEndPickerVisible(false); }}
        onCancel={() => setEndPickerVisible(false)}
        themeVariant={C.bg === '#0A0F0A' ? 'dark' : 'light'}
      />

      <Pressable
        style={({ pressed }) => [vs.saveBtn, (!isSaving && pressed) && { opacity: 0.88 }]}
        onPress={handleSave}
        disabled={isSaving || isLoading}
      >
        {isSaving
          ? <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
          : <Ionicons name="save-outline" size={18} color="#fff" style={{ marginRight: 8 }} />}
        <Text style={vs.saveBtnText}>{isSaving ? 'Saving...' : 'Update Schedule'}</Text>
      </Pressable>
    </View>
  );
};

const CycleControlPanel: React.FC<{
  cycles: ElectionCycle[];
  selectedCycleId: string | null;
  activeCycleId: string | null;
  isBusy: boolean;
  onSelect: (id: string) => void;
  onCreate: (label: string) => void;
  onStatusChange: (id: string, status: ElectionCycleStatus) => void;
}> = ({ cycles, selectedCycleId, activeCycleId, isBusy, onSelect, onCreate, onStatusChange }) => {
  const { C } = useAdminDash();
  const [label, setLabel] = useState('');

  const styles = useMemo(() => ({
    card: { backgroundColor: C.surface2, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 16 } as const,
    title: { fontSize: 18, fontWeight: '800' as const, color: C.text, marginBottom: 10 },
    row: { flexDirection: 'row' as const, gap: 8, alignItems: 'center' as const, marginBottom: 12 },
    input: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, color: C.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 } as const,
    btn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.green } as const,
    btnText: { color: '#fff', fontWeight: '700' as const, fontSize: 13 },
    cycle: { borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, borderRadius: 12, padding: 12, marginBottom: 8 } as const,
    cycleActive: { borderColor: C.green, backgroundColor: C.greenLight } as const,
    cycleHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 8 },
    cycleLabel: { color: C.text, fontSize: 14, fontWeight: '700' as const, flex: 1 },
    status: { color: C.textMuted, fontSize: 11, fontWeight: '800' as const, textTransform: 'uppercase' as const },
    actionRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginTop: 10 },
    action: { borderRadius: 999, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: C.pill } as const,
    actionText: { color: C.textSub, fontSize: 12, fontWeight: '700' as const },
    empty: { color: C.textMuted, fontSize: 13, lineHeight: 18 },
  }), [C]);

  const create = () => {
    const trimmed = label.trim();
    if (!trimmed) {
      Alert.alert('Missing label', 'Enter an academic year label first.');
      return;
    }
    onCreate(trimmed);
    setLabel('');
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Election Cycles</Text>
      <View style={styles.row}>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="e.g. AY 2026-2027"
          placeholderTextColor={C.textMuted}
          style={styles.input}
        />
        <Pressable
          onPress={create}
          disabled={isBusy}
          style={({ pressed }) => [styles.btn, !isBusy && pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="add-circle-outline" size={16} color="#fff" />
          <Text style={styles.btnText}>Create</Text>
        </Pressable>
      </View>

      {cycles.length === 0 ? (
        <Text style={styles.empty}>No election cycles yet. Create a draft cycle to begin annual setup.</Text>
      ) : cycles.map(cycle => {
        const isSelected = cycle.id === selectedCycleId;
        const isActive = cycle.id === activeCycleId;
        return (
          <Pressable
            key={cycle.id}
            onPress={() => onSelect(cycle.id)}
            style={({ pressed }) => [styles.cycle, isSelected && styles.cycleActive, pressed && { opacity: 0.86 }]}
          >
            <View style={styles.cycleHeader}>
              <Text style={styles.cycleLabel}>{cycle.label}{isActive ? ' (Active)' : ''}</Text>
              <Text style={styles.status}>{cycle.status}</Text>
            </View>
            <View style={styles.actionRow}>
              {cycle.status !== 'active' && cycle.status !== 'archived' && (
                <Pressable style={styles.action} disabled={isBusy} onPress={() => onStatusChange(cycle.id, 'active')}>
                  <Text style={styles.actionText}>Activate</Text>
                </Pressable>
              )}
              {cycle.status === 'active' && (
                <Pressable style={styles.action} disabled={isBusy} onPress={() => onStatusChange(cycle.id, 'closed')}>
                  <Text style={styles.actionText}>Close</Text>
                </Pressable>
              )}
              {cycle.status === 'closed' && (
                <Pressable style={styles.action} disabled={isBusy} onPress={() => onStatusChange(cycle.id, 'archived')}>
                  <Text style={styles.actionText}>Archive</Text>
                </Pressable>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
};

// =============================================================================
// MITING CONTROL PANEL
// =============================================================================

const MitingControlPanel: React.FC<{
  isActive: boolean; isLoading: boolean; isToggling: boolean; onToggle: () => void;
}> = ({ isActive, isLoading, isToggling, onToggle }) => {
  const { C } = useAdminDash();

  const ms = useMemo(() => ({
    card: {
      backgroundColor: C.surface2, borderRadius: 16, borderWidth: 1,
      borderColor: C.border, padding: 20, marginBottom: 16,
    } as const,
    statusRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 12 },
    dot: { width: 8, height: 8, borderRadius: 4 } as const,
    statusText: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 1.2 },
    title: { fontSize: 20, fontWeight: '800' as const, color: C.text, marginBottom: 8 },
    desc: { fontSize: 13, color: C.textSub, lineHeight: 20, marginBottom: 20 },
    toggleBtn: {
      flexDirection: 'row' as const, alignItems: 'center' as const,
      justifyContent: 'center' as const, borderRadius: 14, paddingVertical: 15, marginBottom: 14,
    },
    toggleBtnLive: { backgroundColor: C.green } as const,
    toggleBtnEnd:  { backgroundColor: '#EF4444' } as const,
    toggleBtnText: { fontSize: 15, fontWeight: '700' as const, color: '#fff' },
    infoRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
    infoText: { fontSize: 11, color: C.textMuted, flex: 1, lineHeight: 16 },
  }), [C]);

  return (
    <View style={ms.card}>
      <View style={ms.statusRow}>
        <View style={[ms.dot, { backgroundColor: isLoading ? C.textMuted : isActive ? C.green : C.textMuted }]} />
        <Text style={[ms.statusText, { color: isLoading ? C.textMuted : isActive ? C.green : C.textMuted }]}>
          {isLoading ? 'Loading…' : isActive ? 'LIVE' : 'INACTIVE'}
        </Text>
      </View>
      <Text style={ms.title}>Miting de Avance</Text>
      <Text style={ms.desc}>
        {isActive
          ? 'The live Q&A session is currently open. Students can submit and upvote questions.'
          : 'The live Q&A session is currently closed. Tap the button below to open it for students.'}
      </Text>
      <Pressable
        style={({ pressed }) => [
          ms.toggleBtn,
          isActive ? ms.toggleBtnEnd : ms.toggleBtnLive,
          !(isToggling || isLoading) && pressed && { opacity: 0.88 },
        ]}
        onPress={onToggle}
        disabled={isToggling || isLoading}
      >
        {isToggling
          ? <ActivityIndicator color="#fff" style={{ marginRight: 10 }} />
          : <Ionicons
              name={isActive ? 'stop-circle-outline' : 'radio-outline'}
              size={20}
              color="#fff"
              style={{ marginRight: 10 }}
            />}
        <Text style={ms.toggleBtnText}>
          {isToggling ? 'Updating…' : isActive ? 'End Session' : 'Go Live'}
        </Text>
      </Pressable>
      <View style={ms.infoRow}>
        <Ionicons name="information-circle-outline" size={14} color={C.textMuted} />
        <Text style={ms.infoText}>Students receive a notification the moment you go live.</Text>
      </View>
    </View>
  );
};

// =============================================================================
// MITING — LIVE FEED CARD
// =============================================================================

const LiveQuestionCard: React.FC<{
  q: MitingQuestion;
  index: number;
  total: number;
  isViewOnly: boolean;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}> = ({ q, index, total, isViewOnly, onDelete, isDeleting }) => {
  const { C } = useAdminDash();
  const isTop = index === 0 && total > 1;

  const ms = useMemo(() => ({
    qCard: {
      flexDirection: 'row' as const,
      backgroundColor: C.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
      padding: 14,
      marginBottom: 10,
      gap: 12,
    },
    qCardTop: { borderColor: C.green + '55', backgroundColor: C.surface2 } as const,
    upvoteCol: { alignItems: 'center' as const, gap: 3, minWidth: 32, paddingTop: 2 },
    upvoteCount: { fontSize: 12, fontWeight: '700' as const, color: C.textMuted },
    topBadge: {
      alignSelf: 'flex-start' as const,
      backgroundColor: C.greenDim,
      borderRadius: 20,
      paddingHorizontal: 9,
      paddingVertical: 3,
      marginBottom: 6,
    },
    topBadgeText: { fontSize: 11, fontWeight: '700' as const, color: C.green },
    qContent: { flex: 1 },
    qText: { fontSize: 14, color: C.text, lineHeight: 21, marginBottom: 6 },
    qFooter: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
    },
    qMeta: { fontSize: 11, color: C.textMuted },
    viewOnlyPill: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: C.pill,
      borderWidth: 1,
      borderColor: C.border,
    },
    viewOnlyText: { fontSize: 11, color: C.textMuted, fontStyle: 'italic' as const },
    deleteBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: C.redGlow,
      borderWidth: 1,
      borderColor: 'rgba(239,68,68,0.22)',
    },
    deleteBtnText: { fontSize: 12, color: C.red, fontWeight: '600' as const },
  }), [C]);

  const handleDelete = () => {
    Alert.alert(
      'Remove from Live Feed?',
      'This will permanently delete the question for all students.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(q.id) },
      ],
    );
  };

  return (
    <View style={[ms.qCard, isTop && ms.qCardTop]}>
      <View style={ms.upvoteCol}>
        <Ionicons name="arrow-up" size={16} color={isTop ? C.green : C.textMuted} />
        <Text style={[ms.upvoteCount, isTop && { color: C.green }]}>{q.upvote_count}</Text>
      </View>
      <View style={ms.qContent}>
        {isTop && (
          <View style={ms.topBadge}>
            <Text style={ms.topBadgeText}>🔥 Top Question</Text>
          </View>
        )}
        <Text style={ms.qText}>{q.question_text}</Text>
        <View style={ms.qFooter}>
          <Text style={ms.qMeta}>{timeAgo(q.created_at)}</Text>
          {isViewOnly ? (
            <View style={ms.viewOnlyPill}>
              <Ionicons name="eye-outline" size={11} color={C.textMuted} />
              <Text style={ms.viewOnlyText}>View only</Text>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [ms.deleteBtn, !isDeleting && pressed && { opacity: 0.7 }]}
              onPress={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting
                ? <ActivityIndicator size={12} color={C.red} />
                : <Ionicons name="trash-outline" size={12} color={C.red} />}
              <Text style={ms.deleteBtnText}>Delete</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
};

// =============================================================================
// MITING — PENDING APPROVAL CARD
// =============================================================================

const PendingQuestionCard: React.FC<{
  q: MitingQuestion;
  isViewOnly: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  isApproving: boolean;
  isRejecting: boolean;
}> = ({ q, isViewOnly, onApprove, onReject, isApproving, isRejecting }) => {
  const { C } = useAdminDash();

  const ms = useMemo(() => ({
    card: {
      backgroundColor: C.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
      padding: 14,
      marginBottom: 10,
    },
    qText: { fontSize: 14, color: C.text, lineHeight: 21, marginBottom: 6 },
    qMeta: { fontSize: 11, color: C.textMuted },
    viewOnlyRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      marginTop: 10,
    },
    viewOnlyText: { fontSize: 11, color: C.textMuted, fontStyle: 'italic' as const },
    approvalRow: {
      flexDirection: 'row' as const,
      gap: 8,
      marginTop: 12,
    },
    approveBtn: {
      flex: 1,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: C.green,
      borderRadius: 10,
      paddingVertical: 8,
      gap: 6,
    },
    approveBtnText: { fontSize: 13, fontWeight: '700' as const, color: '#fff' },
    rejectBtn: {
      flex: 1,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: C.redGlow,
      borderRadius: 10,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: 'rgba(239,68,68,0.25)',
      gap: 6,
    },
    rejectBtnText: { fontSize: 13, fontWeight: '700' as const, color: C.red },
  }), [C]);

  return (
    <View style={ms.card}>
      <Text style={ms.qText}>{q.question_text}</Text>
      <Text style={ms.qMeta}>{timeAgo(q.created_at)}</Text>
      {isViewOnly ? (
        <View style={ms.viewOnlyRow}>
          <Ionicons name="eye-outline" size={13} color={C.textMuted} />
          <Text style={ms.viewOnlyText}>View only — session ended</Text>
        </View>
      ) : (
        <View style={ms.approvalRow}>
          <Pressable
            style={({ pressed }) => [ms.approveBtn, !(isApproving || isRejecting) && pressed && { opacity: 0.85 }]}
            onPress={() => onApprove(q.id)}
            disabled={isApproving || isRejecting}
          >
            {isApproving
              ? <ActivityIndicator size={14} color="#fff" />
              : <Ionicons name="checkmark-outline" size={14} color="#fff" />}
            <Text style={ms.approveBtnText}>Approve</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [ms.rejectBtn, !(isApproving || isRejecting) && pressed && { opacity: 0.85 }]}
            onPress={() => onReject(q.id)}
            disabled={isApproving || isRejecting}
          >
            {isRejecting
              ? <ActivityIndicator size={14} color={C.red} />
              : <Ionicons name="close-outline" size={14} color={C.red} />}
            <Text style={ms.rejectBtnText}>Reject</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
};

// =============================================================================
// MAIN SCREEN
// =============================================================================

const TABS: { key: FeedTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all',          label: 'All',     icon: 'layers-outline'    },
  { key: 'announcement', label: 'Notices', icon: 'megaphone-outline' },
  { key: 'poll',         label: 'Polls',   icon: 'bar-chart-outline' },
  { key: 'miting',       label: 'Miting',  icon: 'mic-outline'       },
  { key: 'voting',       label: 'Voting',  icon: 'calendar-outline'  },
];

export function AdminDashboardScreen() {
  const [activeTab,   setActiveTab]   = useState<FeedTab>('all');
  const [modal,       setModal]       = useState<ModalState>({ visible: false, mode: 'create', post: null });
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [isSaving,    setIsSaving]    = useState(false);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);

  // ── Comments state ────────────────────────────────────────────────────────
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [commentsModal, setCommentsModal] = useState<{
    visible: boolean;
    postId: string | null;
    postTitle: string;
  }>({ visible: false, postId: null, postTitle: '' });

  // ── Miting state ──────────────────────────────────────────────────────────
  const [mitingSubTab,      setMitingSubTab]      = useState<'live' | 'pending'>('live');
  const [liveQuestions,     setLiveQuestions]     = useState<MitingQuestion[]>([]);
  const [pendingQuestions,  setPendingQuestions]  = useState<MitingQuestion[]>([]);
  const [pendingCount,      setPendingCount]      = useState(0);
  const [approvingId,       setApprovingId]       = useState<string | null>(null);
  const [rejectingId,       setRejectingId]       = useState<string | null>(null);
  const [deletingLiveId,    setDeletingLiveId]    = useState<string | null>(null);
  const [isStartingSession, setIsStartingSession] = useState(false);

  // ── Theme ─────────────────────────────────────────────────────────────────
  const C           = useThemeColors();
  const s           = useMemo(() => makeStyles(C), [C]);
  const isDark      = useThemeStore(st => st.isDark);
  const toggleTheme = useThemeStore(st => st.toggleTheme);
  const activeCycleId = useAuthStore(st => st.activeCycleId);

  // ── Data hooks ────────────────────────────────────────────────────────────
  const { data: cycles = [] } = useElectionCycles();
  const visibleCycleId = selectedCycleId ?? activeCycleId;
  const visibleCycle = cycles.find(c => c.id === visibleCycleId) ?? null;
  const canEditVisibleCycle = visibleCycle?.status === 'active';
  const { mutateAsync: createCycle, isPending: isCreatingCycle } = useCreateElectionCycle();
  const { mutateAsync: updateCycleStatus, isPending: isUpdatingCycleStatus } = useUpdateElectionCycleStatus();
  const { data: rawPosts, isLoading, isError, error, refetch } = usePosts(visibleCycleId);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };
  const { mutateAsync: createPost } = useCreatePost();
  const { mutateAsync: updatePost } = useUpdatePost();
  const { mutateAsync: deletePost } = useDeletePost();

  const { settings, votingStatus, isLoading: settingsLoading } = useSettings();
  const { mutateAsync: updateSettings, isPending: isToggling } = useUpdateSettings();
  const isMitingActive = !!(settings?.is_miting_active);
  const isBusy = isToggling || isStartingSession;
  const isCycleBusy = isCreatingCycle || isUpdatingCycleStatus;

  useEffect(() => {
    if (!selectedCycleId && activeCycleId) setSelectedCycleId(activeCycleId);
  }, [activeCycleId, selectedCycleId]);

  // ── Derived data (must be above useEffects that depend on posts) ──────────
  const posts    = (rawPosts ?? []) as RawPost[];
  const filtered = (activeTab === 'miting' || activeTab === 'voting')
    ? []
    : posts.filter(p => activeTab === 'all' || p.type === activeTab);
  const visibleVotingStatus = useMemo(() => {
    const cycle = visibleCycle;
    if (!cycle?.voting_start_time || !cycle?.voting_end_time) return 'unconfigured';
    const now = Date.now();
    const start = new Date(cycle.voting_start_time).getTime();
    const end = new Date(cycle.voting_end_time).getTime();
    if (now < start) return 'not_started';
    if (now > end) return 'ended';
    return 'active';
  }, [visibleCycle]);

  // ── Always-on pending count (powers the badge on the Miting tab) ──────────
  useEffect(() => {
    const fetchCount = async () => {
      if (!visibleCycleId) {
        setPendingCount(0);
        return;
      }
      const { count } = await supabase
        .from('MitingQuestions')
        .select('*', { count: 'exact', head: true })
        .eq('election_cycle_id', visibleCycleId)
        .eq('is_approved', false);
      setPendingCount(count ?? 0);
    };

    fetchCount();

    const ch = supabase
      .channel('admin-miting-pending-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'MitingQuestions' }, fetchCount)
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [visibleCycleId]);

  // ── Full question lists + realtime (only when Miting tab is open) ─────────
  useEffect(() => {
    if (activeTab !== 'miting' || !visibleCycleId) return;

    let cancelled = false;

    const fetchLive = async () => {
      const { data } = await supabase
        .from('MitingQuestions')
        .select('*')
        .eq('election_cycle_id', visibleCycleId)
        .eq('is_approved', true)
        .order('upvote_count', { ascending: false });
      if (!cancelled && data) setLiveQuestions(data as MitingQuestion[]);
    };

    const fetchPending = async () => {
      const { data } = await supabase
        .from('MitingQuestions')
        .select('*')
        .eq('election_cycle_id', visibleCycleId)
        .eq('is_approved', false)
        .order('created_at', { ascending: true });
      if (!cancelled && data) setPendingQuestions(data as MitingQuestion[]);
    };

    fetchLive();
    fetchPending();

    const ch = supabase
      .channel('admin-miting-questions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'MitingQuestions' }, () => {
        fetchLive();
        fetchPending();
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [activeTab, visibleCycleId]);

  // ── Comment counts per post ───────────────────────────────────────────────
  useEffect(() => {
    if (!posts.length) {
      setCommentCounts({});
      return;
    }

    const fetchCounts = async () => {
      const { data } = await supabase
        .from('Comments')
        .select('post_id')
        .in('post_id', posts.map(p => p.id));

      if (!data) return;

      const counts: Record<string, number> = {};
      data.forEach((row: { post_id: string }) => {
        counts[row.post_id] = (counts[row.post_id] ?? 0) + 1;
      });
      setCommentCounts(counts);
    };

    fetchCounts();

    const ch = supabase
      .channel('admin-comment-counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Comments' }, fetchCounts)
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [posts]);

  // ── Approve a pending question ────────────────────────────────────────────
  const handleApprove = async (id: string) => {
    setApprovingId(id);
    try {
      await supabase.from('MitingQuestions').update({ is_approved: true }).eq('id', id);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not approve question.');
    } finally {
      setApprovingId(null);
    }
  };

  // ── Reject (delete) a pending question ───────────────────────────────────
  const handleReject = (id: string) => {
    Alert.alert(
      'Reject Question',
      'This will permanently remove the question.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setRejectingId(id);
            try {
              await supabase.from('MitingQuestions').delete().eq('id', id);
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Could not reject question.');
            } finally {
              setRejectingId(null);
            }
          },
        },
      ],
    );
  };

  // ── Delete an approved (live) question ───────────────────────────────────
  const handleDeleteLive = async (id: string) => {
    setDeletingLiveId(id);
    try {
      await supabase.from('MitingQuestions').delete().eq('id', id);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not delete question.');
    } finally {
      setDeletingLiveId(null);
    }
  };

  // ── Miting session toggle ─────────────────────────────────────────────────
  const handleMitingToggle = () => {
    if (!activeCycleId || visibleCycleId !== activeCycleId) {
      Alert.alert('Read-only Cycle', 'Activate a cycle before changing Miting settings.');
      return;
    }
    if (isMitingActive) {
      Alert.alert(
        'End Miting Session?',
        'This will close the live Q&A. Students can no longer submit questions. All questions will remain in view-only mode until the next session goes live.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'End Session',
            style: 'destructive',
            onPress: async () => {
              try {
                await updateSettings({ is_miting_active: false });
              } catch (e: any) {
                Alert.alert('Error', e?.message ?? 'Could not end session.');
              }
            },
          },
        ],
      );
    } else {
      const prevCount = liveQuestions.length + pendingQuestions.length;
      const message = prevCount > 0
        ? `This will permanently clear all ${prevCount} question(s) from the previous session and open a fresh live Q&A. Students will be notified immediately.`
        : 'This will open the live Q&A for all students. They will be notified immediately.';

      Alert.alert('Start Miting Session?', message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Go Live',
          onPress: async () => {
            setIsStartingSession(true);
            try {
              if (prevCount > 0) {
                const { data } = await supabase
                  .from('MitingQuestions')
                  .select('id')
                  .eq('election_cycle_id', activeCycleId);
                const ids = (data ?? []).map((q: any) => q.id);
                if (ids.length > 0) {
                  await supabase.from('MitingQuestions').delete().in('id', ids);
                }
                setLiveQuestions([]);
                setPendingQuestions([]);
                setPendingCount(0);
              }
              await updateSettings({ is_miting_active: true });
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Could not start session.');
            } finally {
              setIsStartingSession(false);
            }
          },
        },
      ]);
    }
  };

  // ── Voting schedule save ──────────────────────────────────────────────────
  const handleVotingSave = async (start: string | null, end: string | null) => {
    if (!activeCycleId || visibleCycleId !== activeCycleId) {
      Alert.alert('Read-only Cycle', 'Activate this cycle before changing its voting schedule.');
      return;
    }
    try {
      await updateSettings({ voting_start_time: start, voting_end_time: end });
      Alert.alert('Success', 'Voting schedule updated successfully.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not update voting schedule.');
    }
  };

  // ── Modal helpers ─────────────────────────────────────────────────────────
  const openCreate = () => {
    if (!canEditVisibleCycle || !visibleCycleId) {
      Alert.alert('Read-only Cycle', 'Select the active cycle before creating posts.');
      return;
    }
    setModal({ visible: true, mode: 'create', post: null });
  };
  const openEdit = (post: RawPost) => {
    if (!canEditVisibleCycle) {
      Alert.alert('Read-only Cycle', 'Archived and closed cycles can only be browsed.');
      return;
    }
    setModal({ visible: true, mode: 'edit', post });
  };
  const closeModal = () => setModal(m => ({ ...m, visible: false }));

  const handleSave = async (payload: SavePayload, id?: string) => {
    if (!visibleCycleId || !canEditVisibleCycle) {
      Alert.alert('Read-only Cycle', 'Select the active cycle before saving posts.');
      return;
    }
    setIsSaving(true);
    try {
      let postId: string;
      if (id) {
        await updatePost({ id, updates: { type: payload.type, title: payload.title, content: payload.content } });
        postId = id;
      } else {
        const created = await createPost({
          type: payload.type,
          title: payload.title,
          content: payload.content,
          election_cycle_id: visibleCycleId,
        } as any) as any;
        postId = created.id;
      }
      if (payload.type === 'poll') {
        await savePollOptions(postId, payload.pollOptions);
      }
      await refetch();
      closeModal();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!canEditVisibleCycle) {
      Alert.alert('Read-only Cycle', 'Archived and closed cycles can only be browsed.');
      return;
    }
    setDeletingId(id);
    try {
      await supabase.from('PollOptions').delete().eq('post_id', id);
      await deletePost(id);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not delete post.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreateCycle = async (label: string) => {
    try {
      const created = await createCycle(label);
      setSelectedCycleId(created.id);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not create election cycle.');
    }
  };

  const handleCycleStatusChange = async (id: string, status: ElectionCycleStatus) => {
    try {
      await updateCycleStatus({ id, status });
      setSelectedCycleId(id);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not update election cycle.');
    }
  };

  const renderPost = useCallback(({ item }: { item: RawPost }) => (
    <PostRow
      post={item}
      commentCount={commentCounts[item.id] ?? 0}
      onEdit={openEdit}
      onDelete={handleDelete}
      onViewComments={(post) =>
        setCommentsModal({ visible: true, postId: post.id, postTitle: post.title })
      }
      isDeleting={deletingId === item.id}
    />
  ), [deletingId, commentCounts]);

  // ── Miting sub-tab styles ─────────────────────────────────────────────────
  const mit = useMemo(() => ({
    subTabRow: { flexDirection: 'row' as const, gap: 8, marginBottom: 12 },
    subTab: {
      flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const,
      justifyContent: 'center' as const, paddingVertical: 9, borderRadius: 12,
      borderWidth: 1, borderColor: C.border, backgroundColor: C.pill, gap: 6,
    },
    subTabActive:     { backgroundColor: C.greenLight, borderColor: C.green } as const,
    subTabText:       { fontSize: 13, color: C.textMuted, fontWeight: '500' as const },
    subTabTextActive: { color: C.text, fontWeight: '600' as const },
    pendingBadge: {
      backgroundColor: C.amber, borderRadius: 8, paddingHorizontal: 5,
      paddingVertical: 1, minWidth: 18, alignItems: 'center' as const,
    },
    pendingBadgeText: { fontSize: 10, fontWeight: '800' as const, color: '#000' },
    emptyBox: { alignItems: 'center' as const, paddingVertical: 36, gap: 10 },
    emptyText: { fontSize: 13, color: C.textMuted },
  }), [C]);

  // ── List header ───────────────────────────────────────────────────────────
  const ListHeader = useCallback(() => (
    <>
      <View style={s.appHeader}>
        <View>
          <Text style={s.appLogo}>AnimoQuorum</Text>
          <Text style={s.appSub}>Admin · DLSL COMELEC</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.pill, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
          <Pressable
            onPress={handleRefresh}
            disabled={isRefreshing}
            style={({ pressed }) => [{ padding: 4 }, !isRefreshing && pressed && { opacity: 0.7 }]}
          >
            {isRefreshing
              ? <ActivityIndicator size={18} color={C.green} />
              : <Ionicons name="refresh-outline" size={20} color={C.text} />}
          </Pressable>
          <Pressable onPress={toggleTheme} style={({ pressed }) => [{ paddingLeft: 12, paddingRight: 4 }, pressed && { opacity: 0.7 }]}>
            <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={20} color={C.text} />
          </Pressable>
        </View>
      </View>

      {!isLoading && !isError && <SummaryHeader posts={posts} />}

      <View style={s.sectionBar}>
        <Text style={s.sectionLabel}>Manage Dashboard</Text>
        <Pressable style={({ pressed }) => [s.createBtn, pressed && { opacity: 0.85 }]} onPress={openCreate}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={s.createBtnText}>New Post</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.tabRow}
      >
        {TABS.map(tab => (
          <Pressable
            key={tab.key}
            style={({ pressed }) => [
              s.tab,
              activeTab === tab.key && s.tabActive,
              pressed && { opacity: 0.75 },
            ]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons
              name={tab.icon}
              size={13}
              color={activeTab === tab.key ? C.text : C.textMuted}
            />
            <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>
              {tab.label}
            </Text>
            {tab.key === 'miting' && pendingCount > 0 && (
              <View style={[mit.pendingBadge, { marginLeft: 2 }]}>
                <Text style={mit.pendingBadgeText}>{pendingCount}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </ScrollView>

      {activeTab === 'voting' && (
        <>
          <CycleControlPanel
            cycles={cycles}
            selectedCycleId={visibleCycleId}
            activeCycleId={activeCycleId}
            isBusy={isCycleBusy}
            onSelect={setSelectedCycleId}
            onCreate={handleCreateCycle}
            onStatusChange={handleCycleStatusChange}
          />
          <VotingControlPanel
            settings={visibleCycle ?? settings}
            status={visibleVotingStatus}
            isLoading={settingsLoading}
            isSaving={isToggling}
            onSave={handleVotingSave}
          />
        </>
      )}

      {activeTab === 'miting' && (
        <>
          <MitingControlPanel
            isActive={isMitingActive}
            isLoading={settingsLoading}
            isToggling={isBusy}
            onToggle={handleMitingToggle}
          />

          <View style={mit.subTabRow}>
            <Pressable
              style={({ pressed }) => [
                mit.subTab,
                mitingSubTab === 'live' && mit.subTabActive,
                pressed && { opacity: 0.75 },
              ]}
              onPress={() => setMitingSubTab('live')}
            >
              <Ionicons name="radio-outline" size={14} color={mitingSubTab === 'live' ? C.green : C.textMuted} />
              <Text style={[mit.subTabText, mitingSubTab === 'live' && mit.subTabTextActive]}>Live Feed</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                mit.subTab,
                mitingSubTab === 'pending' && mit.subTabActive,
                pressed && { opacity: 0.75 },
              ]}
              onPress={() => setMitingSubTab('pending')}
            >
              <Ionicons name="time-outline" size={14} color={mitingSubTab === 'pending' ? C.green : C.textMuted} />
              <Text style={[mit.subTabText, mitingSubTab === 'pending' && mit.subTabTextActive]}>Pending</Text>
              {pendingQuestions.length > 0 && (
                <View style={[mit.pendingBadge, { marginLeft: 2 }]}>
                  <Text style={mit.pendingBadgeText}>{pendingQuestions.length}</Text>
                </View>
              )}
            </Pressable>
          </View>

          {mitingSubTab === 'live' && (
            liveQuestions.length === 0 ? (
              <View style={mit.emptyBox}>
                <Ionicons name="chatbubbles-outline" size={32} color={C.textMuted} />
                <Text style={mit.emptyText}>No approved questions yet.</Text>
              </View>
            ) : (
              liveQuestions.map((q, i) => (
                <LiveQuestionCard
                  key={q.id} q={q} index={i} total={liveQuestions.length}
                  isViewOnly={!isMitingActive} onDelete={handleDeleteLive}
                  isDeleting={deletingLiveId === q.id}
                />
              ))
            )
          )}

          {mitingSubTab === 'pending' && (
            pendingQuestions.length === 0 ? (
              <View style={mit.emptyBox}>
                <Ionicons name="hourglass-outline" size={32} color={C.textMuted} />
                <Text style={mit.emptyText}>No pending questions.</Text>
              </View>
            ) : (
              pendingQuestions.map(q => (
                <PendingQuestionCard
                  key={q.id} q={q} isViewOnly={!isMitingActive}
                  onApprove={handleApprove} onReject={handleReject}
                  isApproving={approvingId === q.id} isRejecting={rejectingId === q.id}
                />
              ))
            )
          )}
        </>
      )}
    </>
  ), [
    s, C, isDark, isRefreshing, isLoading, isError, posts, activeTab, settings,
    votingStatus, settingsLoading, isToggling, isMitingActive, isBusy, pendingCount,
    mitingSubTab, liveQuestions, pendingQuestions, approvingId, rejectingId,
    deletingLiveId, mit, handleRefresh, toggleTheme, openCreate, handleMitingToggle,
    handleVotingSave, handleApprove, handleReject, handleDeleteLive,
  ]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AdminDashCtx.Provider value={{ C, s }}>
      <SafeAreaView style={s.screen} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <FlatList<RawPost>
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderPost}
          ListHeaderComponent={ListHeader}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            (activeTab === 'miting' || activeTab === 'voting') ? null
            : isLoading ? (
              <View style={s.stateBox}>
                <ActivityIndicator color={C.green} />
                <Text style={s.stateText}>Loading posts…</Text>
              </View>
            ) : isError ? (
              <View style={s.stateBox}>
                <Ionicons name="alert-circle-outline" size={32} color={C.red} />
                <Text style={s.stateText}>{(error as Error)?.message ?? 'Failed to load posts.'}</Text>
              </View>
            ) : (
              <View style={s.stateBox}>
                <Ionicons name="document-outline" size={32} color={C.textMuted} />
                <Text style={s.stateText}>No posts yet. Create one above.</Text>
              </View>
            )
          }
        />

        <PostModal
          state={modal}
          onClose={closeModal}
          onSave={handleSave}
          isSaving={isSaving}
        />

        <CommentsModal
          visible={commentsModal.visible}
          postId={commentsModal.postId}
          postTitle={commentsModal.postTitle}
          onClose={() => setCommentsModal(m => ({ ...m, visible: false }))}
        />

      </SafeAreaView>
    </AdminDashCtx.Provider>
  );
}
