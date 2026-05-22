/**
 * AdminSettingsScreen.tsx — Admin profile + settings + sign out
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, Pressable, StyleSheet,
  ActivityIndicator, Alert,
  TextInput, StatusBar, Modal,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons }      from '@expo/vector-icons';
import { supabase }      from '../../utils/supabase';
import { useAuthStore }  from '../../stores/authStore';
import { useGrantAdminRole } from '../../hooks/useAdminRole';
import { useThemeColors, ThemeColors } from '../../theme';
import { useThemeStore } from '../../stores/themeStore';

// =============================================================================
// ADD ADMIN MODAL
// =============================================================================

function AddAdminModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const C = useThemeColors();
  const s = useMemo(() => makeStyles(C), [C]);
  const [email, setEmail] = useState('');
  const { mutate, isPending, isError, isSuccess, error, reset } = useGrantAdminRole();

  useEffect(() => {
    if (!visible) return;
    setEmail('');
    reset();
  }, [visible, reset]);

  const handleClose = () => {
    setEmail('');
    reset();
    onClose();
  };

  const handleGrant = () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert('Email required', 'Please enter a student email address.');
      return;
    }
    mutate(trimmed);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1 }}>
          <Pressable style={s.backdrop} onPress={handleClose} />

          <View style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Add New Admin</Text>
              <Pressable onPress={handleClose} style={({ pressed }) => [s.sheetClose, pressed && { opacity: 0.75 }]}>
                <Ionicons name="close" size={20} color={C.textSub} />
              </Pressable>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={s.sheetBody}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={s.fieldLabel}>Student Email Address</Text>
              <TextInput
                style={s.fieldInput}
                placeholder="e.g. juandelacruz@dlsl.edu.ph"
                placeholderTextColor={C.textMuted}
                value={email}
                onChangeText={v => { setEmail(v); reset(); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isPending && !isSuccess}
              />

              {isError && (
                <View style={s.feedbackRow}>
                  <Ionicons name="alert-circle-outline" size={15} color={C.red} />
                  <Text style={[s.feedbackText, { color: C.red }]}>
                    {(error as Error)?.message ?? 'Something went wrong.'}
                  </Text>
                </View>
              )}

              {isSuccess && (
                <View style={s.feedbackRow}>
                  <Ionicons name="checkmark-circle-outline" size={15} color={C.greenBright} />
                  <Text style={[s.feedbackText, { color: C.greenBright }]}>
                    Admin access granted. They should sign out and back in (or restart the app) before Profile shows Switch to Admin.
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={s.sheetFooter}>
            <Pressable
              style={({ pressed }) => [
                s.grantBtn,
                (isPending || isSuccess) && { opacity: 0.6 },
                !isPending && !isSuccess && pressed && { opacity: 0.85 },
              ]}
              onPress={handleGrant}
              disabled={isPending || isSuccess}
            >
              {isPending
                ? <ActivityIndicator size={16} color="#fff" style={{ marginRight: 8 }} />
                : <Ionicons name="shield-checkmark-outline" size={16} color="#fff" style={{ marginRight: 8 }} />
              }
              <Text style={s.grantBtnText}>
                {isPending ? 'Granting Access…' : isSuccess ? 'Access Granted' : 'Grant Admin Access'}
              </Text>
            </Pressable>
          </View>
        </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// =============================================================================
// MAIN SCREEN
// =============================================================================

export function AdminSettingsScreen() {
  const C      = useThemeColors();
  const isDark = useThemeStore(s => s.isDark);
  const s      = useMemo(() => makeStyles(C), [C]);

  const { userProfile, session, role, setProfile, setActiveRole, clear } = useAuthStore();

  const [loading,        setLoading]        = useState(!userProfile);
  const [editing,        setEditing]        = useState(false);
  const [editName,       setEditName]       = useState('');
  const [saving,         setSaving]         = useState(false);
  const [saveError,      setSaveError]      = useState<string | null>(null);
  const [signOutBusy,    setSignOutBusy]    = useState(false);
  const [addAdminVisible, setAddAdminVisible] = useState(false);

  useEffect(() => {
    if (userProfile || !session) { setLoading(false); return; }
    supabase
      .from('Users').select('*').eq('auth_id', session.user.id).single()
      .then(({ data }: any) => { setProfile(data as any); setLoading(false); });
  }, []);

  const initials = userProfile?.name
    ? userProfile.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const startEdit = () => { setEditName(userProfile?.name ?? ''); setSaveError(null); setEditing(true); };

  const saveEdit = async () => {
    const name = editName.trim();
    if (!name) { setSaveError('Name cannot be empty.'); return; }
    if (!userProfile) return;
    setSaving(true); setSaveError(null);
    const { data, error } = await supabase
      .from('Users').update({ name }).eq('id', userProfile.id).select().single();
    setSaving(false);
    if (error) { setSaveError(error.message); return; }
    setProfile(data as any); setEditing(false);
  };

  const handleSwitchToStudent = () => {
    Alert.alert(
      'Switch to Student View',
      'You will see the student screens. Switch back from your profile.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Switch', onPress: () => setActiveRole('Student') },
      ],
    );
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
          setSignOutBusy(true);
          await supabase.auth.signOut();
          clear();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.greenBright} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.bg} />
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        enableAutomaticScroll
        viewIsInsideTabBar
        extraScrollHeight={32}
        keyboardOpeningTime={0}
      >

        <Text style={s.screenTitle}>Settings</Text>

        {/* ── Avatar ── */}
        <View style={s.avatarWrap}>
          <View style={s.avatarCircle}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
        </View>

        {/* ── Name ── */}
        {editing ? (
          <View style={s.editWrap}>
            <TextInput
              style={s.editInput} value={editName} onChangeText={setEditName}
              placeholder="Your full name" placeholderTextColor={C.textMuted}
              autoFocus maxLength={80}
            />
            {saveError ? <Text style={s.saveError}>{saveError}</Text> : null}
            <View style={s.editActions}>
              <Pressable
                style={({ pressed }) => [s.cancelEditBtn, pressed && { opacity: 0.75 }]}
                onPress={() => setEditing(false)}
              >
                <Text style={s.cancelEditText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.saveBtn, saving && { opacity: 0.65 }, !saving && pressed && { opacity: 0.85 }]}
                onPress={saveEdit}
                disabled={saving}
              >
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.saveBtnText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={s.nameRow}>
            <Text style={s.name}>{userProfile?.name ?? '—'}</Text>
            <Pressable onPress={startEdit} style={({ pressed }) => [s.editIcon, pressed && { opacity: 0.75 }]}>
              <Ionicons name="pencil-outline" size={15} color={C.textMuted} />
            </Pressable>
          </View>
        )}

        <Text style={s.email}>{userProfile?.email ?? session?.user.email ?? '—'}</Text>

        {/* ── Admin badge ── */}
        <View style={s.roleBadge}>
          <Ionicons name="shield-outline" size={13} color={C.greenBright} style={{ marginRight: 5 }} />
          <Text style={s.roleBadgeText}>Administrator</Text>
        </View>

        {/* ── Account info ── */}
        <View style={s.infoSection}>
          <InfoRow icon="business-outline"       label="Institution"     value="De La Salle Lipa" />
          <InfoRow icon="calendar-outline"        label="Election"        value="SY 2025–2026" />
          <InfoRow
            icon="checkmark-circle-outline"
            label="Account Status"
            value={userProfile?.is_active ? 'Active' : 'Inactive'}
            valueColor={userProfile?.is_active ? C.greenBright : C.red}
          />
        </View>

        {/* ── Action buttons ── */}

        {/* Row 1: Switch as Student | Add New Admin */}
        <View style={s.actionRow}>
          <Pressable
            style={({ pressed }) => [s.secondaryBtn, pressed && { opacity: 0.75 }]}
            onPress={handleSwitchToStudent}
          >
            <Ionicons name="person-outline" size={15} color={C.textSub} style={{ marginRight: 6 }} />
            <Text style={s.secondaryBtnText}>Switch as Student</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [s.primaryBtn, pressed && { opacity: 0.85 }]}
            onPress={() => setAddAdminVisible(true)}
          >
            <Ionicons name="shield-checkmark-outline" size={15} color="#fff" style={{ marginRight: 6 }} />
            <Text style={s.primaryBtnText}>Add New Admin</Text>
          </Pressable>
        </View>

        {/* Row 2: Sign Out (right-aligned) */}
        <View style={s.signOutRow}>
          <Pressable
            style={({ pressed }) => [s.signOutBtn, signOutBusy && { opacity: 0.65 }, !signOutBusy && pressed && { opacity: 0.85 }]}
            onPress={handleSignOut}
            disabled={signOutBusy}
          >
            {signOutBusy
              ? <ActivityIndicator size="small" color={C.red} />
              : <>
                  <Ionicons name="log-out-outline" size={17} color={C.red} style={{ marginRight: 8 }} />
                  <Text style={s.signOutText}>Sign Out</Text>
                </>
            }
          </Pressable>
        </View>

        <Text style={s.version}>AnimoQuorum v1.0 · DLSL COMELEC</Text>
      </KeyboardAwareScrollView>

      <AddAdminModal
        visible={addAdminVisible}
        onClose={() => setAddAdminVisible(false)}
      />
    </SafeAreaView>
  );
}

// =============================================================================
// INFO ROW
// =============================================================================

function InfoRow({ icon, label, value, valueColor }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string; value: string; valueColor?: string;
}) {
  const C = useThemeColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border }}>
      <Ionicons name={icon} size={16} color={C.textMuted} style={{ marginRight: 10 }} />
      <Text style={{ flex: 1, fontSize: 13, color: C.textSub }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '600', color: valueColor ?? C.text }}>{value}</Text>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: C.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scroll: { alignItems: 'center', paddingTop: 24, paddingHorizontal: 24, paddingBottom: 48 },

    screenTitle: { fontSize: 26, fontWeight: '800', color: C.text, marginBottom: 28, alignSelf: 'flex-start' },

    // ── Avatar
    avatarWrap:   { marginBottom: 16 },
    avatarCircle: {
      width: 90, height: 90, borderRadius: 45,
      backgroundColor: C.surface2, borderWidth: 2, borderColor: C.greenBright,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: C.green, shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.20, shadowRadius: 6, elevation: 3,
    },
    avatarText: { fontSize: 32, fontWeight: '800', color: C.greenBright },

    // ── Name / edit
    nameRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    name:          { fontSize: 22, fontWeight: '800', color: C.text },
    editIcon:      { padding: 5, backgroundColor: C.surface2, borderRadius: 20, borderWidth: 1, borderColor: C.border },
    email:         { fontSize: 13, color: C.textMuted, marginBottom: 14 },
    editWrap:      { width: '100%', marginBottom: 4 },
    editInput: {
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.greenBright + '77',
      borderRadius: 12, color: C.text, fontSize: 16,
      paddingHorizontal: 14, paddingVertical: 12, textAlign: 'center', fontWeight: '700',
    },
    saveError:      { color: C.red, fontSize: 12, textAlign: 'center', marginTop: 6 },
    editActions:    { flexDirection: 'row', gap: 10, marginTop: 10, justifyContent: 'center' },
    cancelEditBtn:  { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
    cancelEditText: { color: C.textMuted, fontWeight: '600' },
    saveBtn: {
      flex: 1, backgroundColor: C.green, borderRadius: 10, paddingVertical: 10, alignItems: 'center',
      shadowColor: C.green, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 3,
    },
    saveBtnText: { color: '#fff', fontWeight: '700' },

    // ── Role badge
    roleBadge: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.greenLight, borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 6, marginBottom: 28,
      borderWidth: 1, borderColor: C.greenBright + '44',
    },
    roleBadgeText: { fontSize: 12, fontWeight: '700', color: C.greenBright },

    // ── Info section
    infoSection: {
      width: '100%', backgroundColor: C.surface, borderRadius: 14,
      borderWidth: 1, borderColor: C.border, marginBottom: 20, overflow: 'hidden',
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
    },

    // ── Action buttons row
    actionRow: {
      flexDirection: 'row', gap: 10, width: '100%', marginBottom: 10,
    },
    secondaryBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      paddingVertical: 13, borderRadius: 12,
      borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
    },
    secondaryBtnText: { fontSize: 13, fontWeight: '600', color: C.textSub },
    primaryBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      paddingVertical: 13, borderRadius: 12, backgroundColor: C.green,
      shadowColor: C.green, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 3,
    },
    primaryBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

    // ── Sign out row
    signOutRow: { width: '100%', alignItems: 'center', marginBottom: 28 },
    signOutBtn: {
      width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.redGlow, borderRadius: 14,
      borderWidth: 1, borderColor: C.red + '44', paddingVertical: 14,
    },
    signOutText: { color: C.red, fontSize: 13, fontWeight: '700' },

    version: { fontSize: 11, color: C.textMuted, letterSpacing: 0.4 },

    // ── Modal / sheet (Add Admin)
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    sheet: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: C.surface,
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      maxHeight: '75%',
      borderWidth: 1, borderColor: C.border,
      shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.08, shadowRadius: 12, elevation: 8,
    },
    sheetHandle: {
      width: 40, height: 4, borderRadius: 2,
      backgroundColor: C.border, alignSelf: 'center',
      marginTop: 12, marginBottom: 4,
    },
    sheetHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 20, paddingVertical: 16,
      borderBottomWidth: 1, borderBottomColor: C.border,
    },
    sheetTitle: { fontSize: 17, fontWeight: '700', color: C.text },
    sheetClose: {
      width: 32, height: 32, borderRadius: 10,
      backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center',
    },
    sheetBody:   { padding: 20, paddingBottom: 8 },
    sheetFooter: { padding: 16, borderTopWidth: 1, borderTopColor: C.border },

    // ── Modal form fields
    fieldLabel: {
      fontSize: 12, fontWeight: '600', color: C.textSub,
      marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6,
    },
    fieldInput: {
      backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border,
      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
      color: C.text, fontSize: 14, marginBottom: 16,
    },
    feedbackRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    feedbackText: { fontSize: 13, flex: 1 },

    // ── Grant button
    grantBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.green, borderRadius: 14, paddingVertical: 14,
      shadowColor: C.green, shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25, shadowRadius: 6, elevation: 3,
    },
    grantBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  });
}