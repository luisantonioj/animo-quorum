/**
 * CommentsModal.tsx — Admin view of threaded comments per post
 * ─────────────────────────────────────────────────────────────
 * - Fetches all Comments for a given post, joined with Users for name
 * - Builds a threaded tree: top-level + nested replies
 * - Admin can delete any comment (cascades to its replies via DB or client)
 * - Realtime subscription keeps the list live while the sheet is open
 * ─────────────────────────────────────────────────────────────
 */

import React, {
  useEffect, useState, useCallback, useMemo,
} from 'react';
import {
  View, Text, Modal, Pressable, ScrollView,
  ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../utils/supabase';
import { useThemeColors } from '../theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawComment {
  id: string;
  post_id: string;
  student_id: string;
  content: string;
  created_at: string;
  parent_id: string | null;
  // joined
  author_name: string;
}

interface CommentNode extends RawComment {
  replies: CommentNode[];
}

interface CommentsModalProps {
  visible: boolean;
  postId: string | null;
  postTitle: string;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

/** Turns a flat list into a tree. Orphaned replies (parent deleted) are dropped. */
function buildTree(flat: RawComment[]): CommentNode[] {
  const map = new Map<string, CommentNode>();
  flat.forEach(c => map.set(c.id, { ...c, replies: [] }));

  const roots: CommentNode[] = [];
  map.forEach(node => {
    if (!node.parent_id) {
      roots.push(node);
    } else {
      const parent = map.get(node.parent_id);
      if (parent) parent.replies.push(node);
    }
  });

  // Sort roots and replies oldest-first
  const sortAsc = (a: CommentNode, b: CommentNode) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

  roots.sort(sortAsc);
  roots.forEach(r => r.replies.sort(sortAsc));

  return roots;
}

// ─── Single comment card ──────────────────────────────────────────────────────

const CommentCard: React.FC<{
  node: CommentNode;
  depth: number;
  deletingId: string | null;
  onDelete: (id: string, hasReplies: boolean) => void;
}> = ({ node, depth, deletingId, onDelete }) => {
  const C = useThemeColors();
  const isDeleting = deletingId === node.id;
  const isReply = depth > 0;

  const styles = useMemo(() => StyleSheet.create({
    wrapper: {
      flexDirection: 'row',
      marginBottom: 10,
      marginLeft: depth * 20,
    },
    indentLine: {
      width: 2,
      borderRadius: 2,
      backgroundColor: C.border,
      marginRight: 10,
      marginTop: 4,
      marginBottom: 4,
    },
    card: {
      flex: 1,
      backgroundColor: isReply ? C.surface : C.surface2,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
      padding: 12,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    authorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
    },
    avatar: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: C.greenDim,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontSize: 10,
      fontWeight: '700',
      color: C.green,
    },
    authorName: {
      fontSize: 12,
      fontWeight: '700',
      color: C.text,
      flexShrink: 1,
    },
    replyBadge: {
      backgroundColor: C.pill,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderWidth: 1,
      borderColor: C.border,
    },
    replyBadgeText: {
      fontSize: 10,
      color: C.textMuted,
      fontWeight: '600',
    },
    content: {
      fontSize: 13,
      color: C.textSub,
      lineHeight: 19,
      marginBottom: 8,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    time: {
      fontSize: 11,
      color: C.textMuted,
    },
    deleteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: C.redGlow,
      borderWidth: 1,
      borderColor: 'rgba(239,68,68,0.22)',
    },
    deleteBtnText: {
      fontSize: 11,
      color: C.red,
      fontWeight: '600',
    },
  }), [C, isReply, depth]);

  const initials = node.author_name
    ? node.author_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <View>
      <View style={styles.wrapper}>
        {isReply && <View style={styles.indentLine} />}
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.authorRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <Text style={styles.authorName} numberOfLines={1}>{node.author_name || 'Unknown'}</Text>
              {isReply && (
                <View style={styles.replyBadge}>
                  <Text style={styles.replyBadgeText}>Reply</Text>
                </View>
              )}
            </View>
          </View>

          <Text style={styles.content}>{node.content}</Text>

          <View style={styles.footer}>
            <Text style={styles.time}>{timeAgo(node.created_at)}</Text>
            <Pressable
              style={({ pressed }) => [
                styles.deleteBtn,
                !isDeleting && pressed && { opacity: 0.7 },
              ]}
              onPress={() => onDelete(node.id, node.replies.length > 0)}
              disabled={isDeleting}
            >
              {isDeleting
                ? <ActivityIndicator size={11} color={C.red} />
                : <Ionicons name="trash-outline" size={11} color={C.red} />}
              <Text style={styles.deleteBtnText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Render replies recursively */}
      {node.replies.map(reply => (
        <CommentCard
          key={reply.id}
          node={reply}
          depth={depth + 1}
          deletingId={deletingId}
          onDelete={onDelete}
        />
      ))}
    </View>
  );
};

// ─── Main Modal ───────────────────────────────────────────────────────────────

export const CommentsModal: React.FC<CommentsModalProps> = ({
  visible, postId, postTitle, onClose,
}) => {
  const C = useThemeColors();

  const [comments, setComments] = useState<RawComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Fetch all comments for this post, joined with Users ──────────────────
  const fetchComments = useCallback(async () => {
    if (!postId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('Comments')
        .select(`
          id,
          post_id,
          student_id,
          content,
          created_at,
          parent_id,
          Users!Comments_student_id_fkey1 (
            name
          )
        `)
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const mapped: RawComment[] = (data ?? []).map((row: any) => ({
        id: row.id,
        post_id: row.post_id,
        student_id: row.student_id,
        content: row.content,
        created_at: row.created_at,
        parent_id: row.parent_id ?? null,
        author_name: row.Users?.name ?? 'Unknown',
      }));

      setComments(mapped);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not load comments.');
    } finally {
      setIsLoading(false);
    }
  }, [postId]);

  // ── Subscribe to realtime changes while modal is open ────────────────────
  useEffect(() => {
    if (!visible || !postId) return;

    fetchComments();

    const channel = supabase
      .channel(`admin-comments-${postId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'Comments', filter: `post_id=eq.${postId}` },
        () => fetchComments(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [visible, postId, fetchComments]);

  // ── Delete: if comment has replies, delete them first then the parent ─────
  const handleDelete = useCallback((id: string, hasReplies: boolean) => {
    const message = hasReplies
      ? 'This comment has replies. Deleting it will also remove all its replies.'
      : 'This comment will be permanently removed.';

    Alert.alert('Delete Comment', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(id);
          try {
            // Delete replies first (child rows), then the parent
            if (hasReplies) {
              const { error: replyErr } = await supabase
                .from('Comments')
                .delete()
                .eq('parent_id', id);
              if (replyErr) throw replyErr;
            }
            const { error } = await supabase
              .from('Comments')
              .delete()
              .eq('id', id);
            if (error) throw error;
            // Optimistic update: remove from local state immediately
            setComments(prev => prev.filter(c => c.id !== id && c.parent_id !== id));
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Could not delete comment.');
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  }, []);

  const tree = useMemo(() => buildTree(comments), [comments]);
  const totalCount = comments.length;

  // ── Styles ────────────────────────────────────────────────────────────────
  const s = useMemo(() => StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    sheet: {
      backgroundColor: C.surface2,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: C.border,
      maxHeight: '85%',
      minHeight: '40%',
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: C.border,
      alignSelf: 'center',
      marginTop: 10,
      marginBottom: 4,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    headerLeft: {
      flex: 1,
      gap: 2,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: C.text,
    },
    headerSub: {
      fontSize: 12,
      color: C.textMuted,
      marginTop: 1,
    },
    countBadge: {
      backgroundColor: C.greenDim,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginRight: 10,
    },
    countText: {
      fontSize: 12,
      fontWeight: '700',
      color: C.green,
    },
    closeBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: C.pill,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: C.border,
    },
    body: {
      padding: 16,
      paddingBottom: 32,
    },
    stateBox: {
      alignItems: 'center',
      paddingVertical: 48,
      gap: 12,
    },
    stateText: {
      fontSize: 13,
      color: C.textMuted,
      textAlign: 'center',
    },
  }), [C]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <Pressable style={s.backdrop} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.handle} />

          {/* Header */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <Text style={s.headerTitle} numberOfLines={1}>Comments</Text>
              <Text style={s.headerSub} numberOfLines={1}>{postTitle}</Text>
            </View>

            {!isLoading && totalCount > 0 && (
              <View style={s.countBadge}>
                <Text style={s.countText}>{totalCount}</Text>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.7 }]}
              onPress={onClose}
            >
              <Ionicons name="close" size={16} color={C.textMuted} />
            </Pressable>
          </View>

          {/* Body */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={s.body}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {isLoading ? (
              <View style={s.stateBox}>
                <ActivityIndicator color={C.green} />
                <Text style={s.stateText}>Loading comments…</Text>
              </View>
            ) : tree.length === 0 ? (
              <View style={s.stateBox}>
                <Ionicons name="chatbubble-outline" size={36} color={C.textMuted} />
                <Text style={s.stateText}>No comments yet on this post.</Text>
              </View>
            ) : (
              tree.map(node => (
                <CommentCard
                  key={node.id}
                  node={node}
                  depth={0}
                  deletingId={deletingId}
                  onDelete={handleDelete}
                />
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};