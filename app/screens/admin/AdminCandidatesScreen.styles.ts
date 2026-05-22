// app/screens/admin/AdminCandidatesScreen.styles.ts
import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../theme';

export const FONT = {
  xs: 10, sm: 12, base: 14, md: 15, lg: 17, xl: 20, xxl: 24,
};

export const RADIUS = {
  sm: 8, md: 12, lg: 16, xl: 20, pill: 999,
};

export const SPACE = {
  xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24, xxl: 32,
};

export function makeStyles(C: ThemeColors) {
  const screen = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.bg,
    },
    header: {
      flexDirection:     'row',
      alignItems:        'center',
      justifyContent:    'space-between',
      paddingHorizontal: SPACE.base,
      paddingTop:        SPACE.lg,
      paddingBottom:     SPACE.md,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    headerTitle: {
      fontSize:      FONT.xxl,
      fontWeight:    '800',
      color:         C.text,
      letterSpacing: -0.5,
    },
    headerSub: {
      fontSize:  FONT.sm,
      color:     C.textMuted,
      marginTop: 2,
    },
    addBtn: {
      flexDirection:     'row',
      alignItems:        'center',
      gap:               5,
      backgroundColor:   C.green,
      borderRadius:      RADIUS.pill,
      paddingHorizontal: SPACE.md,
      paddingVertical:   SPACE.sm,
    },
    addBtnText: {
      fontSize:   FONT.sm,
      fontWeight: '800',
      color:      '#fff',
    },
    scrollContent: {
      paddingHorizontal: SPACE.base,
      paddingTop:        SPACE.lg,
      paddingBottom:     120,
    },
    sectionLabel: {
      fontSize:      FONT.xs,
      fontWeight:    '700',
      letterSpacing: 2,
      color:         C.green,
      textTransform: 'uppercase',
      marginBottom:  SPACE.sm,
      marginTop:     SPACE.md,
    },
  });

  const filter = StyleSheet.create({
    scrollRow: {
      marginBottom: SPACE.md,
    },
    innerRow: {
      flexDirection: 'row',
      gap:           SPACE.sm,
      paddingRight:  SPACE.base,
    },
    tab: {
      paddingHorizontal: SPACE.md,
      paddingVertical:   SPACE.xs + 2,
      borderRadius:      RADIUS.pill,
      borderWidth:       1,
      borderColor:       C.border,
      backgroundColor:   C.surface,
    },
    tabActive: {
      backgroundColor: C.greenLight,
      borderColor:     C.green,
    },
    tabText: {
      fontSize:   FONT.sm,
      fontWeight: '600',
      color:      C.textMuted,
    },
    tabTextActive: {
      color: C.green,
    },
  });

  // ─── NEW: Extracted College Section Styles ─────────────────────────────
  const college = StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: C.surface,
      borderLeftWidth: 4,
      padding: SPACE.md,
      marginTop: SPACE.lg,
      marginBottom: SPACE.sm,
      borderRadius: RADIUS.md,
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
    },
    title: {
      fontSize: FONT.lg,
      fontWeight: '800',
      color: C.text,
    },
    subtitle: {
      fontSize: FONT.sm,
      color: C.textMuted,
      marginTop: 2,
    },
    chip: {
      paddingHorizontal: SPACE.sm,
      paddingVertical: 4,
      borderRadius: RADIUS.pill,
    },
    chipText: {
      fontSize: FONT.xs,
      fontWeight: '700',
    },
  });

  // ─── NEW: Extracted Position Header Styles ─────────────────────────────
  const positionHeader = StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: SPACE.sm,
      marginBottom: SPACE.xs,
      backgroundColor: C.surface,
      padding: SPACE.sm,
      borderRadius: RADIUS.md,
      borderLeftWidth: 4,
      elevation: 1,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 1.5,
    },
    leftContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    icon: {
      fontSize: FONT.lg,
      marginRight: SPACE.sm,
    },
    title: {
      fontSize: FONT.sm,
      fontWeight: '700',
      flex: 1,
    },
    toggleBtn: {
      paddingHorizontal: SPACE.sm,
      paddingVertical: 4,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
    },
    toggleBtnText: {
      fontSize: FONT.xs,
      fontWeight: '700',
    },
  });

  const card = StyleSheet.create({
    wrapper: {
      flexDirection:   'row',
      alignItems:      'center',
      backgroundColor: C.surface,
      borderRadius:    RADIUS.lg,
      borderWidth:     1,
      borderColor:     C.border,
      marginBottom:    SPACE.sm,
      padding:         SPACE.base,
      gap:             SPACE.md,
    },
    avatar: {
      width:           50,
      height:          50,
      borderRadius:    25,
      backgroundColor: C.surface2,
      borderWidth:     2,
      borderColor:     C.greenDim,
      alignItems:      'center',
      justifyContent:  'center',
    },
    avatarText: {
      fontSize:   FONT.md,
      fontWeight: '800',
      color:      C.green,
    },
    info: { flex: 1 },
    name: {
      fontSize:   FONT.md,
      fontWeight: '700',
      color:      C.text,
    },
    positionBadge: {
      fontSize:   FONT.xs,
      color:      C.green,
      fontWeight: '600',
      marginTop:  2,
    },
    partylist: {
      fontSize:  FONT.xs,
      color:     C.textMuted,
      marginTop: 1,
    },
    actions: {
      flexDirection: 'row',
      gap:           SPACE.xs,
    },
    actionBtn: {
      width:          34,
      height:         34,
      borderRadius:   17,
      alignItems:     'center',
      justifyContent: 'center',
      borderWidth:    1,
    },
    viewBtn: {
      backgroundColor: C.surface2,
      borderColor:     C.greenDim,
    },
    editBtn: {
      backgroundColor: C.amberGlow,
      borderColor:     'rgba(245,158,11,0.35)',
    },
    deleteBtn: {
      backgroundColor: C.redGlow,
      borderColor:     'rgba(239,68,68,0.35)',
    },
    actionIcon: { 
      fontSize: 14,
    },
  });

  const form = StyleSheet.create({
    overlay: {
      flex:            1,
      backgroundColor: 'rgba(0,0,0,0.78)',
      justifyContent:  'flex-end',
    },
    sheet: {
      backgroundColor:      C.surface,
      borderTopLeftRadius:  RADIUS.xl,
      borderTopRightRadius: RADIUS.xl,
      borderTopWidth:       1,
      borderTopColor:       C.greenDim,
      paddingHorizontal:    SPACE.xl,
      paddingTop:           SPACE.lg,
      paddingBottom:        48,
      maxHeight:            '92%',
    },
    handle: {
      width:           40,
      height:          4,
      borderRadius:    2,
      backgroundColor: C.border,
      alignSelf:       'center',
      marginBottom:    SPACE.lg,
    },
    title: {
      fontSize:     FONT.xl,
      fontWeight:   '800',
      color:        C.text,
      marginBottom: SPACE.xl,
    },
    fieldLabel: {
      fontSize:      FONT.xs,
      fontWeight:    '700',
      color:         C.textMuted,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      marginBottom:  SPACE.xs,
      marginTop:     SPACE.md,
    },
    input: {
      backgroundColor:   C.surface2,
      borderRadius:      RADIUS.md,
      borderWidth:       1,
      borderColor:       C.border,
      paddingHorizontal: SPACE.md,
      paddingVertical:   SPACE.sm + 2,
      fontSize:          FONT.base,
      color:             C.text,
    },
    inputFocused: {
      borderColor: C.green,
    },
    textArea: {
      minHeight:         88,
      textAlignVertical: 'top',
    },
    positionScrollRow: {
      marginBottom: SPACE.xs,
    },
    positionInnerRow: {
      flexDirection: 'row',
      gap:           SPACE.sm,
      paddingBottom: SPACE.xs,
    },
    positionTab: {
      paddingHorizontal: SPACE.md,
      paddingVertical:   SPACE.xs + 2,
      borderRadius:      RADIUS.pill,
      borderWidth:       1,
      borderColor:       C.border,
      backgroundColor:   C.surface2,
    },
    positionTabActive: {
      backgroundColor: C.greenLight,
      borderColor:     C.green,
    },
    positionTabText: {
      fontSize:   FONT.sm,
      fontWeight: '600',
      color:      C.textMuted,
    },
    positionTabTextActive: {
      color: C.green,
    },
    divider: {
      height:          1,
      backgroundColor: C.border,
      marginVertical:  SPACE.xl,
    },
    btnRow: {
      flexDirection: 'row',
      gap:           SPACE.sm,
    },
    btnSave: {
      flex:            1,
      backgroundColor: C.green,
      borderRadius:    RADIUS.lg,
      paddingVertical: SPACE.md,
      alignItems:      'center',
    },
    btnSaveDisabled: {
      opacity: 0.45,
    },
    btnSaveText: {
      fontSize:   FONT.md,
      fontWeight: '800',
      color:      '#fff',
    },
    btnCancel: {
      flex:            1,
      backgroundColor: C.surface2,
      borderRadius:    RADIUS.lg,
      paddingVertical: SPACE.md,
      alignItems:      'center',
      borderWidth:     1,
      borderColor:     C.border,
    },
    btnCancelText: {
      fontSize:   FONT.md,
      fontWeight: '700',
      color:      C.textMuted,
    },
  });

  const empty = StyleSheet.create({
    wrapper: {
      alignItems:      'center',
      justifyContent:  'center',
      paddingVertical: SPACE.xxl * 2,
      gap:             SPACE.md,
    },
    icon:  { fontSize: 36, marginBottom: SPACE.sm },
    title: { fontSize: FONT.lg, fontWeight: '700', color: C.text },
    body:  { fontSize: FONT.sm, color: C.textMuted, textAlign: 'center' },
  });

  return { screen, filter, college, positionHeader, card, form, empty };
}

export type AdminCandidatesStyles = ReturnType<typeof makeStyles>;