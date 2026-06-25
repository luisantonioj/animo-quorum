// app/screens/admin/AdminCandidatesScreen.tsx
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../utils/supabase';
import { useDeleteCandidate } from '../../hooks/useCandidates';
import { uploadCandidatePhoto, isLocalFileUri } from '../../utils/storage';
import { usePositions } from '../../hooks/usePositions';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import {
  useCandidateStore,
  DEPARTMENTS,
  PROGRAMS,
  PROGRAM_COORDINATOR_POSITION,
} from '../../stores/candidateStore';
import type { Candidate, Department, Position, VoterDepartment } from '../../stores/candidateStore';
import { useAuthStore } from '../../stores/authStore';

import { CandidateModal } from '../../components/CandidateModal';
import type { CandidateRow } from '../../components/CandidateModal';

import {
  makeStyles,
  FONT,
  SPACE,
  RADIUS,
} from './AdminCandidatesScreen.styles';
import { useThemeColors } from '../../theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormState {
  name:        string;
  partylist:   string;
  department:  string;
  position:    string;
  program:     string;
  email:       string;
  credentials: string;
  platform:    string;
  photo_uri:   string | null;
}

interface FormErrors {
  name?:       string;
  department?: string;
  position?:   string;
  email?:      string;
  duplicate?:  string;
}

interface ParsedPosition {
  id:            string;
  position_name: string;
  department:    string;
  clean_name:    string;
  program:       string | null;
}

const EMPTY_FORM: FormState = {
  name:        '',
  partylist:   '',
  department:  '',
  position:    '',
  program:     '',
  email:       '',
  credentials: '',
  platform:    '',
  photo_uri:   null,
};

const DEPT_BLOCK_START: Record<string, number> = {
  'Executive Council': 10,
  'CBEAM':             100,
  'CEAS':              200,
  'CIHTM':             300,
  'CITE':              400,
  'CON':               500,
  // Add new colleges here as needed, in multiples of 100
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0] ?? '')
    .join('')
    .toUpperCase();
}

function toModalRow(c: Candidate): CandidateRow {
  return {
    id:          c.id,
    name:        c.name,
    partylist:   c.partylist || null,
    position_id: c.position_id,
    email:       c.email,
    credentials: c.credentials,
    platform:    c.platform,
    photo_url:   c.photo_url,
    Positions:   { position_name: c.position_name },
  };
}

function validateForm(
  form: FormState,
  candidates: Candidate[],
  editId: string | null,
): FormErrors {
  const errors: FormErrors = {};
  const trimmedName = form.name.trim();

  if (!trimmedName) {
    errors.name = 'Full name is required.';
  } else if (trimmedName.length < 3) {
    errors.name = 'Name must be at least 3 characters.';
  }

  if (!form.department) errors.department = 'Department is required.';
  if (!form.position)   errors.position   = 'Position is required.';
  if (
    form.department &&
    form.department !== 'Executive Council' &&
    form.position === PROGRAM_COORDINATOR_POSITION &&
    !form.program
  ) {
    errors.position = 'Program is required for Program Coordinator.';
  }

  if (form.email.trim()) {
    const dlslEmailRegex = /^[^\s@]+@dlsl\.edu\.ph$/i;
    if (!dlslEmailRegex.test(form.email.trim())) {
      errors.email = 'Email must be a valid @dlsl.edu.ph address.';
    }
  }

  if (trimmedName && form.department && form.position) {
    const isDuplicate = candidates.some(
      c =>
        c.id !== editId &&
        c.name.trim().toLowerCase() === trimmedName.toLowerCase() &&
        c.department === form.department &&
        c.position_name === form.position &&
        (c.program ?? '') === (form.program ?? ''),
    );
    if (isDuplicate) {
      errors.duplicate = `"${trimmedName}" already exists under ${form.department} — ${form.position}.`;
    }
  }

  return errors;
}

// ─── Department selector with inline add/delete ───────────────────────────────

const DepartmentSelector: React.FC<{
  selected:    string;
  departments: string[];
  onChange:    (dept: string) => void;
  onAdd:       (name: string) => void;
  onDelete:    (dept: string) => void;
}> = ({ selected, departments, onChange, onAdd, onDelete }) => {
  const C = useThemeColors();
  const S = useMemo(() => makeStyles(C), [C]);
  const [adding,  setAdding]  = useState(false);
  const [newName, setNewName] = useState('');

  const handleConfirmAdd = () => {
    const trimmed = newName.trim();
    if (trimmed && !departments.includes(trimmed)) {
      onAdd(trimmed);
      onChange(trimmed);
    }
    setNewName('');
    setAdding(false);
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.form.positionScrollRow}>
      <View style={S.form.positionInnerRow}>
        {departments.map(d => (
          <Pressable
            key={d}
            style={({ pressed }) => [
              S.form.positionTab,
              selected === d && S.form.positionTabActive,
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => onChange(d)}
            onLongPress={() =>
              Alert.alert(
                'Delete Department',
                `Remove "${d}" and all its positions? This cannot be undone.`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => onDelete(d) },
                ],
              )
            }
          >
            <Text style={[S.form.positionTabText, selected === d && S.form.positionTabTextActive]}>
              {d}
            </Text>
          </Pressable>
        ))}

        {adding ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
            <TextInput
              autoFocus
              value={newName}
              onChangeText={setNewName}
              onSubmitEditing={handleConfirmAdd}
              // No onBlur
              placeholder="e.g. CNAHS"
              placeholderTextColor={C.textMuted}
              style={[S.form.positionTab, { minWidth: 100, color: C.text }]}
            />
            <Pressable onPress={handleConfirmAdd} style={[S.form.positionTab, S.form.positionTabActive]}>
              <Text style={[S.form.positionTabText, S.form.positionTabTextActive]}>✓</Text>
            </Pressable>
            <Pressable onPress={() => { setAdding(false); setNewName(''); }} style={S.form.positionTab}>
              <Text style={[S.form.positionTabText, { color: C.textMuted }]}>✕</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setAdding(true)} style={[S.form.positionTab, { borderStyle: 'dashed' }]}>
            <Text style={[S.form.positionTabText, { color: C.textMuted }]}>＋ Dept</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
};

// ─── Position selector with inline add/delete ─────────────────────────────────

const PositionSelector: React.FC<{
  positions: string[];
  selected:  string;
  onChange:  (pos: string) => void;
  onAdd:     (name: string) => Promise<void>;  // ← was void
  onDelete:  (name: string) => void;
}> = ({ positions, selected, onChange, onAdd, onDelete }) => {
  const C = useThemeColors();
  const S = useMemo(() => makeStyles(C), [C]);
  const [adding,  setAdding]  = useState(false);
  const [newName, setNewName] = useState('');
  const [isAdding, setIsAdding] = useState(false);  // ← loading state

  const handleConfirmAdd = async () => {  // ← async
    const trimmed = newName.trim();
    if (!trimmed || positions.includes(trimmed)) {
      setNewName('');
      setAdding(false);
      return;
    }
    setIsAdding(true);
    try {
      await onAdd(trimmed);   // ← await DB insert first
      onChange(trimmed);      // ← then select it
      setNewName('');
      setAdding(false);
    } catch {
      // error already alerted by parent
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.form.positionScrollRow}>
      <View style={S.form.positionInnerRow}>
        {positions.map(p => (
          <Pressable
            key={p}
            style={({ pressed }) => [
              S.form.positionTab,
              selected === p && S.form.positionTabActive,
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => onChange(p)}
            onLongPress={() =>
              Alert.alert(
                'Delete Position',
                `Remove "${p}"? Candidates under this position will lose their assignment.`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => onDelete(p) },
                ],
              )
            }
          >
            <Text style={[S.form.positionTabText, selected === p && S.form.positionTabTextActive]}>
              {p}
            </Text>
          </Pressable>
        ))}

        {adding ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
            <TextInput
              autoFocus
              value={newName}
              onChangeText={setNewName}
              onSubmitEditing={handleConfirmAdd}
              // Remove onBlur entirely — it fires before onPress and kills the add
              placeholder="e.g. Auditor"
              placeholderTextColor={C.textMuted}
              style={[S.form.positionTab, { minWidth: 100, color: C.text }]}
            />
            <Pressable
              onPress={handleConfirmAdd}
              style={[S.form.positionTab, S.form.positionTabActive]}
            >
              {isAdding
                ? <ActivityIndicator size={12} color={C.green} />
                : <Text style={[S.form.positionTabText, S.form.positionTabTextActive]}>✓</Text>
              }
            </Pressable>
            <Pressable
              onPress={() => { setAdding(false); setNewName(''); }}
              style={S.form.positionTab}
            >
              <Text style={[S.form.positionTabText, { color: C.textMuted }]}>✕</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setAdding(true)} style={[S.form.positionTab, { borderStyle: 'dashed' }]}>
            <Text style={[S.form.positionTabText, { color: C.textMuted }]}>＋ Position</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
};

// ─── Add / Edit form bottom sheet ─────────────────────────────────────────────

const CandidateFormSheet: React.FC<{
  visible:            boolean;
  editId:             string | null;
  initial:            FormState;
  candidates:         Candidate[];
  parsedPositions:    ParsedPosition[];
  onClose:            () => void;
  onSave:             (id: string | null, data: FormState) => void;
  onAddPosition:      (dept: string, cleanName: string) => Promise<void>;
  onDeletePosition:   (dept: string, cleanName: string) => Promise<void>;
  onDeleteDepartment: (dept: string) => Promise<void>;
}> = ({ visible, editId, initial, candidates, parsedPositions, onClose, onSave,
        onAddPosition, onDeletePosition, onDeleteDepartment }) => {
  const C = useThemeColors();
  const S = useMemo(() => makeStyles(C), [C]);

  const [form,          setFormState]     = useState<FormState>(initial);
  const [errors,        setErrors]        = useState<FormErrors>({});
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [isSaving,      setIsSaving]      = useState(false);
  const [extraDepts,    setExtraDepts]    = useState<string[]>([]);

  useEffect(() => {
    setFormState(initial);
    setErrors({});
    setSaveAttempted(false);
    setIsSaving(false);
    setExtraDepts([]);
  }, [initial, visible]);

  const setField = useCallback((field: keyof FormState, value: string | null) => {
    setFormState(prev => {
      const next: FormState = { ...prev, [field]: value ?? '' };
      if (field === 'department') {
        next.position = '';
        next.program = '';
      }
      if (field === 'position' && value !== PROGRAM_COORDINATOR_POSITION) {
        next.program = '';
      }
      return next;
    });
  }, []);

  const allDepartments = useMemo(() => {
  const fromDB = Array.from(new Set(parsedPositions.map(p => p.department)));
  return Array.from(new Set([...DEPARTMENTS, ...fromDB, ...extraDepts]));
}, [parsedPositions, extraDepts]);

  const handleAddDept = useCallback((name: string) => {
    setExtraDepts(prev => [...prev, name]);
  }, []);

  const handleDeleteDept = useCallback(async (dept: string) => {
    try {
      await onDeleteDepartment(dept);
      setExtraDepts(prev => prev.filter(d => d !== dept));
      if (form.department === dept) setField('department', '');
    } catch (err: any) {
      Alert.alert('Delete Failed', err.message);
    }
  }, [form.department, onDeleteDepartment, setField]);

  const [localExtraPositions, setLocalExtraPositions] = useState<string[]>([]);

  // Reset local positions when sheet opens/closes or department changes
  useEffect(() => {
    setLocalExtraPositions([]);
  }, [visible, form.department]);

  // Replace the existing availablePositions useMemo:
  const availablePositions = useMemo(() => {
    if (!form.department) return [];
    const fromProps = parsedPositions
      .filter(p => p.department === form.department)
      .map(p => p.clean_name);
    const basePositions = form.department === 'Executive Council'
      ? []
      : [PROGRAM_COORDINATOR_POSITION];
    return Array.from(new Set([...fromProps, ...basePositions, ...localExtraPositions]));
  }, [form.department, parsedPositions, localExtraPositions]);

  // Replace the existing handleAddPosition in CandidateFormSheet:
  const handleAddPosition = useCallback(async (cleanName: string) => {
    if (!form.department) return;
    try {
      if (cleanName !== PROGRAM_COORDINATOR_POSITION) {
        await onAddPosition(form.department, cleanName);
      }
      setLocalExtraPositions(prev => [...prev, cleanName]);
    } catch (err: any) {
      Alert.alert('Add Failed', err.message); // now shows real Supabase error
      throw err; // rethrow so PositionSelector doesn't select a failed position
    }
  }, [form.department, onAddPosition]);

  const handleDeletePosition = useCallback(async (cleanName: string) => {
    if (!form.department) return;
    if (cleanName === PROGRAM_COORDINATOR_POSITION) {
      Alert.alert(
        'Program Coordinator',
        'Program Coordinator rows are tied to specific programs. Leave them in place and assign candidates through the Program field.',
      );
      return;
    }
    try {
      await onDeletePosition(form.department, cleanName);
      setLocalExtraPositions(prev => prev.filter(p => p !== cleanName));
      if (form.position === cleanName) setField('position', '');
    } catch (err: any) {
      Alert.alert('Delete Failed', err.message);
    }
  }, [form.department, form.position, onDeletePosition, setField]);

  const currentErrors = useMemo(
    () => validateForm(form, candidates, editId),
    [form, candidates, editId],
  );

  const isValid = Object.keys(currentErrors).length === 0
    && form.name.trim().length >= 3
    && !!form.department
    && !!form.position
    && (
      form.position !== PROGRAM_COORDINATOR_POSITION ||
      form.department === 'Executive Council' ||
      !!form.program
    );

  const visibleErrors: FormErrors = saveAttempted ? currentErrors : {};
  const programOptions = useMemo(() => {
    if (
      !form.department ||
      form.department === 'Executive Council' ||
      form.position !== PROGRAM_COORDINATOR_POSITION
    ) {
      return [];
    }
    return PROGRAMS[form.department as VoterDepartment] ?? [];
  }, [form.department, form.position]);

  const handlePickPhoto = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please allow access to your photo library to upload a photo.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (!result.canceled && result.assets[0]) {
        setField('photo_uri', result.assets[0].uri);
      }
    } catch (err: any) {
      Alert.alert(
        'Could not open photo library',
        err?.message ?? 'Please try again.',
      );
    }
  }, [setField]);

  const handleRemovePhoto = useCallback(() => {
    setField('photo_uri', null);
  }, [setField]);

  const handleSave = useCallback(async () => {
    setSaveAttempted(true);
    if (!isValid) return;
    setIsSaving(true);
    try {
      await onSave(editId, form);
    } finally {
      setIsSaving(false);
    }
  }, [isValid, editId, form, onSave]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={S.form.overlay}>
        <KeyboardAwareScrollView
          style={S.form.sheet}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
          enableOnAndroid
          enableAutomaticScroll
          viewIsInsideTabBar
          extraScrollHeight={56}
          keyboardOpeningTime={0}
        >
          
          <Text style={S.form.title}>{editId ? 'Edit Candidate' : 'Add Candidate'}</Text>

          {/* Photo */}
          <Text style={S.form.fieldLabel}>Photo</Text>
          <View style={{ alignItems: 'center', marginBottom: SPACE.md }}>
            <Pressable onPress={handlePickPhoto} style={({ pressed }) => pressed && { opacity: 0.85 }}>
              {form.photo_uri ? (
                <Image source={{ uri: form.photo_uri }} style={{ width: 90, height: 90, borderRadius: 45, borderWidth: 2, borderColor: C.green }} />
              ) : (
                <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: C.surface2, borderWidth: 2, borderColor: C.greenDim, alignItems: 'center', justifyContent: 'center' }}>
                  {form.name.trim()
                    ? <Text style={{ fontSize: FONT.xl, fontWeight: '800', color: C.green }}>{getInitials(form.name)}</Text>
                    : <Text style={{ fontSize: 28, color: C.textMuted }}>📷</Text>
                  }
                </View>
              )}
            </Pressable>
            <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.sm }}>
              <Pressable
                onPress={handlePickPhoto}
                style={({ pressed }) => ({ paddingHorizontal: SPACE.md, paddingVertical: SPACE.xs, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.greenDim, backgroundColor: C.surface2, opacity: pressed ? 0.85 : 1 })}
              >
                <Text style={{ fontSize: FONT.sm, color: C.textSub, fontWeight: '600' }}>
                  {form.photo_uri ? 'Change Photo' : 'Upload from Gallery'}
                </Text>
              </Pressable>
              {form.photo_uri ? (
                <Pressable
                  onPress={handleRemovePhoto}
                  style={({ pressed }) => ({ paddingHorizontal: SPACE.md, paddingVertical: SPACE.xs, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)', backgroundColor: C.redGlow, opacity: pressed ? 0.85 : 1 })}
                >
                  <Text style={{ fontSize: FONT.sm, color: C.red, fontWeight: '600' }}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Full Name */}
          <Text style={S.form.fieldLabel}>Full Name *</Text>
          <TextInput
            style={[S.form.input, !!visibleErrors.name && { borderColor: C.red }]}
            placeholder="e.g. Juan dela Cruz"
            placeholderTextColor={C.textMuted}
            value={form.name}
            onChangeText={v => setField('name', v)}
          />
          {visibleErrors.name ? <Text style={{ fontSize: FONT.xs, color: C.red, marginTop: 3 }}>{visibleErrors.name}</Text> : null}

          {/* Partylist */}
          <Text style={S.form.fieldLabel}>Partylist</Text>
          <TextInput
            style={S.form.input}
            placeholder="e.g. Animo Party"
            placeholderTextColor={C.textMuted}
            value={form.partylist}
            onChangeText={v => setField('partylist', v)}
          />

          {/* Department */}
          <Text style={S.form.fieldLabel}>Department *</Text>
          <DepartmentSelector
            selected={form.department}
            departments={allDepartments}
            onChange={d => setField('department', d)}
            onAdd={handleAddDept}
            onDelete={handleDeleteDept}
          />
          {visibleErrors.department ? <Text style={{ fontSize: FONT.xs, color: C.red, marginTop: 3 }}>{visibleErrors.department}</Text> : null}

          {/* Position */}
          <Text style={S.form.fieldLabel}>Position *</Text>
          {form.department ? (
            <PositionSelector
              positions={availablePositions}
              selected={form.position}
              onChange={p => setField('position', p)}
              onAdd={handleAddPosition}
              onDelete={handleDeletePosition}
            />
          ) : (
            <Text style={{ fontSize: FONT.sm, color: C.textMuted, fontStyle: 'italic', marginBottom: SPACE.sm }}>
              Select a department first.
            </Text>
          )}
          {visibleErrors.position ? <Text style={{ fontSize: FONT.xs, color: C.red, marginTop: 3 }}>{visibleErrors.position}</Text> : null}

          {programOptions.length > 0 ? (
            <>
              <Text style={S.form.fieldLabel}>Program *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.form.positionScrollRow}>
                <View style={S.form.positionInnerRow}>
                  {programOptions.map(program => (
                    <Pressable
                      key={program}
                      style={({ pressed }) => [
                        S.form.positionTab,
                        form.program === program && S.form.positionTabActive,
                        pressed && { opacity: 0.85 },
                      ]}
                      onPress={() => setField('program', program)}
                    >
                      <Text style={[S.form.positionTabText, form.program === program && S.form.positionTabTextActive]}>
                        {program}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </>
          ) : null}

          {/* Duplicate warning */}
          {visibleErrors.duplicate ? (
            <View style={{ backgroundColor: C.redGlow, borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)', padding: SPACE.sm, marginTop: SPACE.xs }}>
              <Text style={{ fontSize: FONT.sm, color: C.red }}>{visibleErrors.duplicate}</Text>
            </View>
          ) : null}

          {/* School Email */}
          <Text style={S.form.fieldLabel}>School Email</Text>
          <TextInput
            style={[S.form.input, !!visibleErrors.email && { borderColor: C.red }]}
            placeholder="candidate@dlsl.edu.ph"
            placeholderTextColor={C.textMuted}
            value={form.email}
            onChangeText={v => setField('email', v)}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {visibleErrors.email ? <Text style={{ fontSize: FONT.xs, color: C.red, marginTop: 3 }}>{visibleErrors.email}</Text> : null}

          {/* Credentials */}
          <Text style={S.form.fieldLabel}>Credentials</Text>
          <TextInput
            style={[S.form.input, S.form.textArea]}
            placeholder="Academic achievements, leadership roles…"
            placeholderTextColor={C.textMuted}
            value={form.credentials}
            onChangeText={v => setField('credentials', v)}
            multiline
          />

          {/* Platform */}
          <Text style={S.form.fieldLabel}>Platform</Text>
          <TextInput
            style={[S.form.input, S.form.textArea]}
            placeholder="Key advocacies and plans for the student body…"
            placeholderTextColor={C.textMuted}
            value={form.platform}
            onChangeText={v => setField('platform', v)}
            multiline
          />

          <View style={S.form.divider} />

          <View style={S.form.btnRow}>
            <Pressable style={({ pressed }) => [S.form.btnCancel, pressed && { opacity: 0.85 }]} onPress={onClose} disabled={isSaving}>
              <Text style={S.form.btnCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                S.form.btnSave,
                (!isValid || isSaving) && S.form.btnSaveDisabled,
                isValid && pressed && !isSaving && { opacity: 0.88 },
              ]}
              onPress={handleSave}
              disabled={!isValid || isSaving}
            >
              {isSaving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={S.form.btnSaveText}>{editId ? 'Save Changes' : 'Add Candidate'}</Text>
              }
            </Pressable>
          </View>

          <View style={{ height: 24 }} />
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
};

// ─── Single candidate card ────────────────────────────────────────────────────

const CandidateCard: React.FC<{
  candidate: Candidate;
  onView:    () => void;
  onEdit:    () => void;
  onDelete:  () => void;
}> = ({ candidate, onView, onEdit, onDelete }) => {
  const C = useThemeColors();
  const S = useMemo(() => makeStyles(C), [C]);

  return (
    <View style={S.card.wrapper}>
      <View style={S.card.avatar}>
        {candidate.photo_url ? (
          <Image source={{ uri: candidate.photo_url }} style={{ width: 50, height: 50, borderRadius: 25 }} />
        ) : (
          <Text style={S.card.avatarText}>{getInitials(candidate.name)}</Text>
        )}
      </View>
      <View style={S.card.info}>
        <Text style={S.card.name} numberOfLines={1}>{candidate.name}</Text>
        <Text style={S.card.positionBadge} numberOfLines={1}>{candidate.position_name}</Text>
        {candidate.partylist ? <Text style={S.card.partylist} numberOfLines={1}>{candidate.partylist}</Text> : null}
      </View>
      <View style={S.card.actions}>
        <Pressable
          style={({ pressed }) => [
            S.card.actionBtn,
            S.card.viewBtn,
            pressed && { opacity: 0.75 },
          ]}
          onPress={onView}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="eye-outline" size={18} style={S.card.actionIcon} color={C.text} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            S.card.actionBtn,
            S.card.editBtn,
            pressed && { opacity: 0.75 },
          ]}
          onPress={onEdit}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="create-outline" size={18} style={S.card.actionIcon} color={C.text} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            S.card.actionBtn,
            S.card.deleteBtn,
            pressed && { opacity: 0.75 },
          ]}
          onPress={onDelete}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="trash-outline" size={18} style={S.card.actionIcon} color={C.text} />
        </Pressable>
      </View>
    </View>
  );
};

// ─── Position section header with enable/disable toggle ───────────────────────

const PositionHeader: React.FC<{
  positionName: string;
  program?:     string | null;
  positionId:   string;
  isDisabled:   boolean;
  onToggle:     () => void;
}> = ({ positionName, program, positionId: _positionId, isDisabled, onToggle }) => {
  const C = useThemeColors();
  const displayName = program ? `${positionName} - ${program}` : positionName;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACE.sm, marginBottom: SPACE.xs }}>
      <Text style={{ fontSize: FONT.xs, fontWeight: '700', letterSpacing: 1.2, color: isDisabled ? C.textMuted : C.textSub, textTransform: 'uppercase', flex: 1, marginRight: SPACE.sm }}
        numberOfLines={1}
      >
        {displayName}
      </Text>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => ({
          paddingHorizontal: SPACE.sm,
          paddingVertical:   SPACE.xs,
          borderRadius:      RADIUS.pill,
          borderWidth:       1,
          borderColor:       isDisabled ? 'rgba(239,68,68,0.35)' : C.greenDim,
          backgroundColor:   isDisabled ? C.redGlow              : C.surface2,
          opacity:           pressed ? 0.85 : 1,
        })}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Text style={{ fontSize: FONT.xs, fontWeight: '700', color: isDisabled ? C.red : C.textSub }}>
          {isDisabled ? '⛔ Disabled' : '✓ Active'}
        </Text>
      </Pressable>
    </View>
  );
};

// ─── Main screen ──────────────────────────────────────────────────────────────

function AdminCandidatesScreen() {
  const C = useThemeColors();
  const S = useMemo(() => makeStyles(C), [C]);
  const queryClient = useQueryClient();
  const activeCycleId = useAuthStore(state => state.activeCycleId);
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
    }, [queryClient])
  );

  const disabledPositions      = useCandidateStore(state => state.disabledPositions);
  const togglePositionDisabled = useCandidateStore(state => state.togglePositionDisabled);

  const { data: dbPositions = [] } = usePositions();

  const parsedPositions: ParsedPosition[] = useMemo(() => {
    return dbPositions.map(p => {
      const dept      = p.college || 'Executive Council';
      const cleanName = dept !== 'Executive Council' && p.position_name.startsWith(dept + ' ')
        ? p.position_name.slice(dept.length + 1)
        : p.position_name;
      return { id: p.id, position_name: p.position_name, department: dept, clean_name: cleanName, program: p.program ?? null };
    });
  }, [dbPositions]);

  const { data: dbCandidates = [], isLoading } = useQuery({
    queryKey: ['candidates', 'admin', activeCycleId],
    queryFn: async () => {
      if (!activeCycleId) return [];
      const { data, error } = await supabase
        .from('Candidates')
        .select('*, Positions(position_name)')
        .eq('election_cycle_id', activeCycleId);
      if (error) throw error;
      return data;
    },
    enabled: !!activeCycleId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      // Step 1: Nullify votes referencing this candidate
      // (sets candidate_id to NULL rather than deleting votes,
      //  preserving the voter turnout count and audit trail)
      const { error: voteError } = await supabase
        .from('Votes')
        .update({ candidate_id: null })
        .eq('candidate_id', candidateId);

      if (voteError) throw new Error(`Failed to unlink votes: ${voteError.message}`);

      // Step 2: Now safe to delete the candidate
      const { error: deleteError } = await supabase
        .from('Candidates')
        .delete()
        .eq('id', candidateId);

      if (deleteError) throw new Error(`Failed to delete candidate: ${deleteError.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['candidates', 'admin'] });
    },
    onError: (err: any) => {
      Alert.alert('Deletion Failed', err.message);
    },
  });

  const addMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { data, error } = await supabase.from('Candidates').insert([payload]).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidates'] }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const { data, error } = await supabase.from('Candidates').update(payload).eq('id', id).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidates'] }),
  });

  const candidates: Candidate[] = useMemo(() => {
    return dbCandidates.map((c: any) => {
      const posRow      = dbPositions.find(p => p.id === c.position_id);
      const dept        = posRow?.college || 'Executive Council';
      const fullPosName = c.Positions?.position_name || '';
      const posName     = dept !== 'Executive Council' && fullPosName.startsWith(dept + ' ')
        ? fullPosName.slice(dept.length + 1)
        : fullPosName;

      return {
        id:            c.id,
        name:          c.name,
        partylist:     c.partylist || '',
        position_id:   c.position_id,
        position_name: posName as Position,
        department:    dept as Department,
        program:       posRow?.program ?? null,
        photo_url:     c.photo_url,
        email:         c.email,
        credentials:   c.credentials,
        platform:      c.platform,
      };
    });
  }, [dbCandidates, dbPositions]);

  // ─── State ────────────────────────────────────────────────────────────────

  const [activeFilter,    setActiveFilter]    = useState<string>('all');
  const [formVisible,     setFormVisible]     = useState(false);
  const [editId,          setEditId]          = useState<string | null>(null);
  const [formInitial,     setFormInitial]     = useState<FormState>(EMPTY_FORM);
  const [viewedCandidate, setViewedCandidate] = useState<Candidate | null>(null);

  const grouped = useMemo(() => {
    const deptMap: Record<string, { positionName: string; program: string | null; positionId: string; items: Candidate[] }[]> = {};

    for (const pos of dbPositions) {
      const dept      = pos.college || 'Executive Council';
      const shortName = dept !== 'Executive Council' && pos.position_name.startsWith(dept + ' ')
        ? pos.position_name.slice(dept.length + 1)
        : pos.position_name;

      if (!deptMap[dept]) deptMap[dept] = [];
      deptMap[dept].push({
        positionName: shortName,
        program:      pos.program ?? null,
        positionId:   pos.id,
        items:        candidates.filter(c => c.position_id === pos.id),
      });
    }

    // Derive visible depts dynamically from DB so added depts show up
    const allKnownDepts = Array.from(new Set([
      ...DEPARTMENTS,
      ...Object.keys(deptMap),
    ]));

    const visibleDepts = activeFilter === 'all' ? allKnownDepts : [activeFilter];

    return visibleDepts
      .filter(dept => deptMap[dept])
      .map(dept => ({ department: dept, positionGroups: deptMap[dept] }));
  }, [candidates, activeFilter, dbPositions]);

  const allDepts = useMemo(() => {
    const fromDB = Array.from(new Set(
      dbPositions.map(p => p.college || 'Executive Council')
    ));
    return Array.from(new Set([...DEPARTMENTS, ...fromDB]));
  }, [dbPositions]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const openAdd = useCallback(() => {
    setEditId(null);
    setFormInitial({ ...EMPTY_FORM });
    setFormVisible(true);
  }, []);

  const openEdit = useCallback((c: Candidate) => {
    setEditId(c.id);
    setFormInitial({
      name:        c.name,
      partylist:   c.partylist   ?? '',
      department:  c.department,
      position:    c.position_name,
      program:     c.program ?? '',
      email:       c.email       ?? '',
      credentials: c.credentials ?? '',
      platform:    c.platform    ?? '',
      photo_uri:   c.photo_url,
    });
    setFormVisible(true);
  }, []);

  const confirmDelete = useCallback((c: Candidate) => {
    Alert.alert(
      'Delete Candidate',
      `Remove "${c.name}" from the ballot? Any votes cast for this candidate will be unlinked. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(c.id), // ← no onError needed here anymore
        },
      ],
    );
  }, [deleteMutation]);

  const handleSave = useCallback(async (id: string | null, data: FormState) => {
    if (!data.department || !data.position) return;
    if (!activeCycleId) {
      Alert.alert('No Active Election', 'Create or activate an election cycle before adding candidates.');
      return;
    }
    try {
      const expectedPosName = data.department === 'Executive Council'
        ? data.position
        : `${data.department} ${data.position}`;
      const expectedProgram = data.position === PROGRAM_COORDINATOR_POSITION && data.department !== 'Executive Council'
        ? data.program
        : null;

      let posId = dbPositions.find(p =>
        p.position_name === expectedPosName &&
        (p.program ?? null) === expectedProgram
      )?.id;

      if (!posId) {
        const { data: newPos, error } = await supabase
          .from('Positions')
          .insert([{
            position_name: expectedPosName,
            college: data.department === 'Executive Council' ? null : data.department,
            program: expectedProgram,
          }])
          .select()
          .single();
        if (error) throw new Error(`Failed to create position: ${error.message}`);
        posId = newPos.id;
        queryClient.invalidateQueries({ queryKey: ['positions'] });
      }

      // Upload local photos to Supabase Storage. We can't persist a file:// URI
      // because that path only exists on the admin's device — every other
      // viewer (students, other admins) would see a broken image.
      let photoUrl: string | null = data.photo_uri;
      if (photoUrl && isLocalFileUri(photoUrl)) {
        try {
          photoUrl = await uploadCandidatePhoto(photoUrl, data.name);
        } catch (uploadErr: any) {
          Alert.alert(
            'Photo Upload Failed',
            uploadErr?.message ??
              'Could not upload the candidate photo. Please check your connection and try again.',
          );
          return;
        }
      }

      const payload = {
        name:        data.name.trim(),
        partylist:   data.partylist.trim()   || null,
        position_id: posId,
        election_cycle_id: activeCycleId,
        email:       data.email.trim()       || null,
        credentials: data.credentials.trim() || null,
        platform:    data.platform.trim()    || null,
        photo_url:   photoUrl,
      };

      if (id) {
        await updateMutation.mutateAsync({ id, payload });
      } else {
        await addMutation.mutateAsync(payload);
      }

      setFormVisible(false);
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'An unexpected error occurred.');
    }
  }, [dbPositions, addMutation, updateMutation, queryClient, activeCycleId]);

  // ─── Position/Department CRUD (live in parent, passed as props) ───────────

  const handleAddPosition = useCallback(async (dept: string, cleanName: string) => {
    const fullName = dept === 'Executive Council' ? cleanName : `${dept} ${cleanName}`;
    if (dbPositions.find(p => p.position_name === fullName)) return;

    // ─── Smart display_order using sparse convention ───────────────────────
    // Department blocks: Executive=0s, CBEAM=100s, CEAS=200s, etc.
    // Within a block, gap of 10. New positions appended at end of their block.
    // BS/Program Coordinators always get a higher number within the block.

    const DEPT_BLOCK_START: Record<string, number> = {
      'Executive Council': 10,
      'CBEAM':             100,
      'CEAS':              200,
      'CIHTM':             300,
      'CITE':              400,
      'CON':               500,
    };

    const BLOCK_SIZE = 100; // each dept owns a range of 100

    let newOrder: number;

    const blockStart = DEPT_BLOCK_START[dept];

    if (blockStart !== undefined) {
      // Known department — find the highest display_order within this block
      const blockEnd = blockStart + BLOCK_SIZE - 1;
      const sibling  = dbPositions
        .filter(p => p.display_order >= blockStart && p.display_order <= blockEnd)
        .sort((a, b) => b.display_order - a.display_order)[0];

      if (sibling) {
        // Snap to the next multiple of 10 above the current max
        newOrder = Math.ceil((sibling.display_order + 1) / 10) * 10;
        // Safety: don't overflow into the next dept block
        if (newOrder > blockEnd) newOrder = sibling.display_order + 1;
      } else {
        // Empty block — start at block start
        newOrder = blockStart;
      }
    } else {
      // Brand new / unknown department — assign the next available 100-block
      const usedBlockStarts = Object.values(DEPT_BLOCK_START);
      const maxKnownBlock   = Math.max(...usedBlockStarts); // e.g. 500
      const allBlockStarts  = dbPositions
        .map(p => Math.floor(p.display_order / BLOCK_SIZE) * BLOCK_SIZE)
        .filter(b => b > 0);
      const maxUsedBlock = allBlockStarts.length > 0
        ? Math.max(...allBlockStarts)
        : maxKnownBlock;

      const nextBlock = Math.ceil((Math.max(maxUsedBlock, maxKnownBlock) + 1) / BLOCK_SIZE) * BLOCK_SIZE;
      newOrder = nextBlock;

      // Register this new dept in our local map for subsequent additions in the same session
      DEPT_BLOCK_START[dept] = nextBlock;
    }

    const { data, error } = await supabase
      .from('Positions')
      .insert([{
        position_name: fullName,
        college:       dept === 'Executive Council' ? null : dept,
        display_order: newOrder,
      }])
      .select()
      .single();

    if (error) throw new Error(`Supabase: ${error.message} (code: ${error.code})`);
    queryClient.setQueryData(['positions'], (old: any) => old ? [...old, data] : [data]);
    queryClient.invalidateQueries({ queryKey: ['positions'] });
  }, [dbPositions, queryClient]);

  const handleDeletePosition = useCallback(async (dept: string, cleanName: string) => {
    const fullName = dept === 'Executive Council' ? cleanName : `${dept} ${cleanName}`;
    const pos = dbPositions.find(p => p.position_name === fullName);

    if (!pos) {
      Alert.alert('Delete Failed', `Position "${cleanName}" not found in local data. Try refreshing.`);
      return;
    }

    if (candidates.some(c => c.position_id === pos.id)) {
      throw new Error(`"${cleanName}" still has candidates. Remove them first.`);
    }

    const { error } = await supabase.from('Positions').delete().eq('id', pos.id);
    if (error) throw new Error(`Supabase: ${error.message} (code: ${error.code})`);

    queryClient.setQueryData(['positions'], (old: any) =>
      old ? old.filter((p: any) => p.id !== pos.id) : []
    );
    queryClient.invalidateQueries({ queryKey: ['positions'] });
  }, [dbPositions, candidates, queryClient]);

  const handleDeleteDepartment = useCallback(async (dept: string) => {
    const deptPositions = dbPositions.filter(p => (p.college || 'Executive Council') === dept);
    if (deptPositions.some(pos => candidates.some(c => c.position_id === pos.id))) {
      throw new Error(`"${dept}" still has candidates. Remove them first.`);
    }
    if (deptPositions.length > 0) {
      const { error } = await supabase.from('Positions').delete().in('id', deptPositions.map(p => p.id));
      if (error) throw new Error(error.message);
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.setQueryData(['positions'], (old: any) => 
        old ? old.filter((p: any) => (p.college || 'Executive Council') !== dept) : []
      );
    }
  }, [dbPositions, candidates, queryClient]);

  const renderCards = useCallback((list: Candidate[]) =>
    list.map(c => (
      <CandidateCard
        key={c.id}
        candidate={c}
        onView={() => setViewedCandidate(c)}
        onEdit={() => openEdit(c)}
        onDelete={() => confirmDelete(c)}
      />
    )),
  [openEdit, confirmDelete]);

  // ─── Main UI ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={S.screen.container} edges={['top', 'left', 'right']}>

      <View style={S.screen.header}>
        <View>
          <Text style={S.screen.headerTitle}>Candidates</Text>
          <Text style={S.screen.headerSub}>
            {candidates.length} registered · {DEPARTMENTS.length} departments
          </Text>
        </View>
        <Pressable style={({ pressed }) => [S.screen.addBtn, pressed && { opacity: 0.88 }]} onPress={openAdd}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800', lineHeight: 18 }}>＋</Text>
          <Text style={S.screen.addBtnText}>Add</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={C.green} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={S.screen.scrollContent} showsVerticalScrollIndicator={false}>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.filter.scrollRow}>
            <View style={S.filter.innerRow}>
              <Pressable
                style={({ pressed }) => [S.filter.tab, activeFilter === 'all' && S.filter.tabActive, pressed && { opacity: 0.85 }]}
                onPress={() => setActiveFilter('all')}
              >
                <Text style={[S.filter.tabText, activeFilter === 'all' && S.filter.tabTextActive]}>All</Text>
              </Pressable>
              {allDepts.map(d => (
                <Pressable
                  key={d}
                  style={({ pressed }) => [S.filter.tab, activeFilter === d && S.filter.tabActive, pressed && { opacity: 0.85 }]}
                  onPress={() => setActiveFilter(d)}
                >
                  <Text style={[S.filter.tabText, activeFilter === d && S.filter.tabTextActive]}>{d}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {grouped.map(({ department, positionGroups }) => (
            <View key={department}>
              {activeFilter === 'all' && (
                <Text style={[S.screen.sectionLabel, { marginTop: SPACE.lg }]}>
                  {department}
                </Text>
              )}

              {positionGroups.map(({ positionName, program, positionId, items }) => {
                const isDisabled = disabledPositions.has(positionId);
                return (
                  <View key={positionId}>
                    <PositionHeader
                      positionName={positionName}
                      program={program}
                      positionId={positionId}
                      isDisabled={isDisabled}
                      onToggle={() => togglePositionDisabled(positionId)}
                    />

                    {isDisabled && (
                      <View style={{ backgroundColor: C.redGlow, borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)', padding: SPACE.sm, marginBottom: SPACE.sm }}>
                        <Text style={{ fontSize: FONT.xs, color: C.red, textAlign: 'center' }}>
                          This position is disabled and excluded from the ballot.
                        </Text>
                      </View>
                    )}

                    {items.length === 0 ? (
                      <View style={{ backgroundColor: C.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, padding: SPACE.base, marginBottom: SPACE.sm }}>
                        <Text style={{ fontSize: FONT.sm, color: C.textMuted, textAlign: 'center', fontStyle: 'italic' }}>
                          No candidates for this position.
                        </Text>
                      </View>
                    ) : renderCards(items)}
                  </View>
                );
              })}
            </View>
          ))}

        </ScrollView>
      )}

      <CandidateFormSheet
        visible={formVisible}
        editId={editId}
        initial={formInitial}
        candidates={candidates}
        parsedPositions={parsedPositions}
        onClose={() => setFormVisible(false)}
        onSave={handleSave}
        onAddPosition={handleAddPosition}
        onDeletePosition={handleDeletePosition}
        onDeleteDepartment={handleDeleteDepartment}
      />

      <CandidateModal
        candidate={viewedCandidate ? toModalRow(viewedCandidate) : null}
        visible={!!viewedCandidate}
        onClose={() => setViewedCandidate(null)}
        onAdminEdit={row => {
          const original = candidates.find(x => x.id === row.id);
          if (!original) return;
          setViewedCandidate(null);
          setTimeout(() => openEdit(original), 250);
        }}
        onAdminDelete={row => {
          const original = candidates.find(x => x.id === row.id);
          if (!original) return;
          setViewedCandidate(null);
          setTimeout(() => confirmDelete(original), 250);
        }}
      />
    </SafeAreaView>
  );
}

export { AdminCandidatesScreen };
export default AdminCandidatesScreen;
