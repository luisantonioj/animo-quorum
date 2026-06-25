// app/screens/admin/AdminResultsScreen.tsx
import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, SPACE } from './AdminResultsScreen.styles';
import type { AdminResultsStyles } from './AdminResultsScreen.styles';
import { useThemeColors } from '../../theme';
import { useThemeStore } from '../../stores/themeStore';
import { useLiveResults, LivePosition, LiveCandidate } from '../../hooks/useLiveResults';
import { useSettings, useUpdateSettings } from '../../hooks/useSettings';
import { useElectionCycles } from '../../hooks/useElectionCycles';
import { useAuthStore } from '../../stores/authStore';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const COLLEGE_COLORS: { [key: string]: string } = {
  'Executive Council': '#033a06',
  CITE:   '#DC2626',
  CBEAM:  '#B45309',
  CON:    '#16A34A',
  CEAS:   '#1D4ED8',
  CIHTM:  '#7C3AED',
};

const COLLEGE_POPULATIONS: Record<string, number> = {
  CITE: 702, CBEAM: 669, CON: 749, CEAS: 748, CIHTM: 642,
};

const POSITION_ICONS: { [key: string]: string } = {
  President: '👑', 
  'Vice President': '⭐', 
  Secretary: '📝', 
  Treasurer: '💰',
};

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

function CandidateBar({ candidate, total, rank, accentColor, S }: {
  candidate: LiveCandidate; total: number; rank: number; accentColor: string; S: AdminResultsStyles;
}) {
  const pct = total > 0 ? Math.round((candidate.votes / total) * 100) : 0;
  const isLeading = rank === 0 && candidate.votes > 0;
  
  return (
    <View style={S.candidate.row}>
      <View style={S.candidate.meta}>
        <View style={[S.candidate.rankBadge, isLeading && { backgroundColor: accentColor }]}>
          <Text style={[S.candidate.rankText, isLeading && { color: '#fff' }]}>#{rank + 1}</Text>
        </View>
        <Text style={S.candidate.name} numberOfLines={1}>{candidate.name}</Text>
        <Text style={[S.candidate.votes, { color: accentColor }]}>{candidate.votes}</Text>
        <Text style={S.candidate.pct}>{pct}%</Text>
      </View>
      <View style={S.candidate.barTrack}>
        <View style={[S.candidate.barFill, { width: `${pct}%`, backgroundColor: isLeading ? accentColor : accentColor + '66' }]} />
      </View>
    </View>
  );
}

function PositionCard({ position, accentColor, S }: {
  position: LivePosition; accentColor: string; S: AdminResultsStyles;
}) {
  return (
    <View style={S.card.wrapper}>
      <View style={S.card.header}>
        <Text style={S.card.title}>{position.position_name}</Text>
        {/* <View style={[S.card.badge, { borderColor: accentColor }]}>
          <Text style={[S.card.badgeText, { color: accentColor }]}>{position.totalVotes} votes</Text>
        </View> */}
      </View>
      {position.candidates.map((candidate, idx) => (
        <CandidateBar
          key={candidate.id}
          candidate={candidate}
          total={position.totalVotes}
          rank={idx}
          accentColor={accentColor}
          S={S}
        />
      ))}
    </View>
  );
}

function CollegeSection({ college, positions, S }: {
  college: string; positions: LivePosition[]; S: AdminResultsStyles;
}) {
  const color = COLLEGE_COLORS[college] ?? '#888';
  const studentTurnout = positions.length > 0 
    ? Math.max(...positions.map(p => p.totalVotes)) 
    : 0;
    
  if (positions.length === 0) return null;

  return (
    <View style={S.college.section}>
      <View style={[S.college.banner, { borderLeftColor: color }]}>
        <View>
          <Text style={S.college.name}>{college}</Text>
          <Text style={S.college.stat}>{studentTurnout.toLocaleString()} {college === 'Executive Council' ? 'overall students voted' : 'students voted'}
          </Text>
        </View>
        <View style={[S.college.chip, { backgroundColor: color + '22' }]}>
          <Text style={[S.college.chipText, { color }]}>{positions.length} positions</Text>
        </View>
      </View>
      {positions.map(pos => {
        const cleanName = college !== 'Executive Council' && pos.position_name.startsWith(college + ' ')
          ? pos.position_name.slice(college.length + 1)
          : pos.position_name;
        return (
          <PositionCard
            key={pos.id}
            position={{ ...pos, position_name: cleanName }}
            accentColor={color}
            S={S}
          />
        );
      })}
    </View>
  );
}

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────────

function VoterTurnoutPanel({ positions, S, C }: {
  positions: LivePosition[]; S: AdminResultsStyles; C: any;
}) {
  const stats = useMemo(() => {
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

    const colleges = Object.keys(byCollege)
      .filter(k => k !== 'Executive Council')
      .map(name => {
        const pos = byCollege[name];
        const voted = pos.length > 0 ? Math.max(...pos.map(p => p.totalVotes)) : 0;
        const total = COLLEGE_POPULATIONS[name] || 1000;
        const pct = total > 0 ? Math.round((voted / total) * 1000) / 10 : 0;
        return { name, voted, total, pct, color: COLLEGE_COLORS[name] ?? '#888' };
      })
      .sort((a, b) => b.pct - a.pct);

    const totalEnrolled = colleges.reduce((s, c) => s + c.total, 0) || 3510;
    const overallPct = totalEnrolled > 0 ? Math.round((overallVoted / totalEnrolled) * 1000) / 10 : 0;
    return { overallVoted, overallPct, totalEnrolled, colleges };
  }, [positions]);

  return (
    <View>
      <View style={[S.card.wrapper, { marginBottom: 16 }]}>
        <View style={S.card.header}>
          <Text style={S.card.title}>Overall Turnout</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 32, fontWeight: '800', color: C.green }}>{stats.overallPct}%</Text>
          <Text style={{ fontSize: 13, color: C.textMuted }}>
            {stats.overallVoted.toLocaleString()} / {stats.totalEnrolled.toLocaleString()} students
          </Text>
        </View>
        <View style={{ height: 6, backgroundColor: C.surface2, borderRadius: 3, marginTop: 10, overflow: 'hidden' }}>
          <View style={{ width: `${Math.min(stats.overallPct, 100)}%`, height: '100%', backgroundColor: C.green, borderRadius: 3 }} />
        </View>
      </View>

      {stats.colleges.map((col, idx) => (
        <View key={col.name} style={S.card.wrapper}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <View style={{
              width: 28, height: 28, borderRadius: 14,
              backgroundColor: col.color + '22', alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: col.color }}>{col.name[0]}</Text>
            </View>
            <Text style={[S.college.name, { flex: 1 }]}>{col.name}</Text>
            <View style={[S.college.chip, { backgroundColor: col.color + '22' }]}>
              <Text style={[S.college.chipText, { color: col.color }]}>#{idx + 1}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: col.color }}>{col.pct}%</Text>
            <Text style={{ fontSize: 12, color: C.textMuted }}>
              {col.voted.toLocaleString()} / {col.total.toLocaleString()}
            </Text>
          </View>
          <View style={{ height: 6, backgroundColor: C.surface2, borderRadius: 3, overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(col.pct, 100)}%`, height: '100%', backgroundColor: col.color, borderRadius: 3 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function AdminResultsScreen() {
  const C = useThemeColors();
  const { isDark, toggleTheme } = useThemeStore();
  const S = useMemo(() => makeStyles(C), [C]);
  
  const [activeTab, setActiveTab] = useState('All');
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const activeCycleId = useAuthStore(state => state.activeCycleId);
  const { data: cycles = [] } = useElectionCycles();
  const visibleCycleId = selectedCycleId ?? activeCycleId;
  const visibleCycle = cycles.find(c => c.id === visibleCycleId) ?? null;

  useEffect(() => {
    if (!selectedCycleId && activeCycleId) setSelectedCycleId(activeCycleId);
  }, [activeCycleId, selectedCycleId]);

  // Hook into our live Supabase data
  const { positions, isLoading, isError, error, refetch } = useLiveResults(visibleCycleId);

  const { settings } = useSettings();
  const { mutateAsync: updateSettings } = useUpdateSettings();
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const isTurnoutVisible = settings?.show_live_results !== false;

  const handleToggleVisibility = async () => {
    if (visibleCycleId !== activeCycleId) return;
    setTogglingVisibility(true);
    try {
      await updateSettings({ show_live_results: !isTurnoutVisible });
    } finally {
      setTogglingVisibility(false);
    }
  };

  // Calculate the massive global total across everything
  const grandTotal = useMemo(() => {
    // Filter out just the Executive Council positions
    const execPositions = positions.filter(p => (p.college || 'Executive Council') === 'Executive Council');
    
    // If we have Exec positions, the highest vote count among them is our total voter turnout.
    if (execPositions.length > 0) {
      return Math.max(...execPositions.map(p => p.totalVotes));
    }
    
    // Fallback: If no Exec positions exist for some reason, just check the highest position globally
    return positions.length > 0 ? Math.max(...positions.map(p => p.totalVotes)) : 0;
  }, [positions]);

  // Group and filter the data dynamically based on the active tab
  const groupedSections = useMemo(() => {
    if (activeTab === 'All') {
      // Group everything by college
      const grouped = positions.reduce((acc, pos) => {
        const col = pos.college || 'Executive Council';
        if (!acc[col]) acc[col] = [];
        acc[col].push(pos);
        return acc;
      }, {} as Record<string, LivePosition[]>);

      return Object.entries(grouped).map(([college, posList]) => ({
        college,
        positions: posList,
      }));
    } else {
      // Filter just for the selected tab
      const filtered = positions.filter(p => (p.college || 'Executive Council') === activeTab);
      return [{ college: activeTab, positions: filtered }];
    }
  }, [positions, activeTab]);

  const tabs = useMemo(() => {
    const preferred = ['Executive Council', 'CITE', 'CBEAM', 'CON', 'CEAS', 'CIHTM'];
    const fromData  = Array.from(new Set(positions.map(p => p.college || 'Executive Council')));
    const ordered   = preferred.filter(c => fromData.includes(c));
    const extra     = fromData.filter(c => !preferred.includes(c));
    return ['Per Department', 'All', ...ordered, ...extra];
  }, [positions]);

  return (
    <SafeAreaView style={S.screen.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.bg} />

      {/* ── Header (Matches AdminCandidatesScreen exactly) ── */}
      <View style={S.screen.header}>
        <View>
          <Text style={S.screen.headerTitle}>Live Results</Text>
          <Text style={S.screen.headerSub}>
            {visibleCycle?.label ?? 'No active election'} - turnout: {grandTotal.toLocaleString()}
          </Text>
        </View>
        
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable
            onPress={handleToggleVisibility}
            disabled={togglingVisibility || visibleCycleId !== activeCycleId}
            style={({ pressed }) => [S.live.controlsRow, visibleCycleId !== activeCycleId && { opacity: 0.45 }, pressed && { opacity: 0.75 }]}
          >
            {togglingVisibility
              ? <ActivityIndicator size={16} color={C.text} style={{ padding: SPACE.xs }} />
              : <Ionicons name={isTurnoutVisible ? 'eye-outline' : 'eye-off-outline'} size={20} color={C.text} style={{ padding: SPACE.xs }} />
            }
            <Text style={{ fontSize: 11, fontWeight: '600', color: C.text, paddingRight: SPACE.xs }}>
              {isTurnoutVisible ? 'Visible' : 'Hidden'}
            </Text>
          </Pressable>

          <View style={S.live.controlsRow}>
            <Pressable
              onPress={refetch}
              disabled={isLoading}
              style={({ pressed }) => [S.live.iconBtn, !isLoading && pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="refresh-outline" size={20} color={C.text} />
            </Pressable>
          </View>
        </View>
      </View>

      {isLoading && positions.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={C.green} />
        </View>
      ) : (
        <ScrollView 
          contentContainerStyle={S.screen.scrollContent} 
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isLoading && positions.length > 0} onRefresh={refetch} tintColor={C.green} />
          }
        >
          {/* ── Pill Tabs (Matches Dashboard filtering) ── */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.filter.scrollRow}>
            <View style={S.filter.innerRow}>
              {cycles.map(cycle => {
                const isSelected = cycle.id === visibleCycleId;
                return (
                  <Pressable
                    key={cycle.id}
                    onPress={() => setSelectedCycleId(cycle.id)}
                    style={({ pressed }) => [
                      S.filter.tab,
                      isSelected && { backgroundColor: C.greenLight, borderColor: C.green },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text style={[S.filter.tabText, isSelected && S.filter.tabTextActive]}>
                      {cycle.label} ({cycle.status})
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <Text style={{ color: C.textMuted, fontSize: 12, lineHeight: 18, marginBottom: SPACE.sm }}>
            Turnout denominators are still hardcoded in COLLEGE_POPULATIONS and should become per-cycle data before official reporting.
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={S.filter.scrollRow}
          >
            <View style={S.filter.innerRow}>
              {tabs.map(tab => {
                const isActive = tab === activeTab;
                const tabColor = COLLEGE_COLORS[tab] || C.green;
                
                return (
                  <Pressable
                    key={tab}
                    onPress={() => setActiveTab(tab)}
                    style={({ pressed }) => [
                      S.filter.tab,
                      isActive && { backgroundColor: tabColor + '1A', borderColor: tabColor },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text style={[S.filter.tabText, isActive && S.filter.tabTextActive, isActive && { color: tabColor }]}>
                      {tab}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* ── Content ── */}
          {isError ? (
            <View style={S.empty.wrapper}>
              <Text style={S.empty.title}>Failed to load</Text>
              <Text style={S.empty.body}>{error || 'Could not connect to live results.'}</Text>
            </View>
          ) : activeTab === 'Per Department' ? (
            positions.length === 0
              ? <View style={S.empty.wrapper}><Text style={S.empty.title}>No data yet</Text></View>
              : <VoterTurnoutPanel positions={positions} S={S} C={C} />
          ) : groupedSections.length === 0 ? (
            <View style={S.empty.wrapper}>
              <Text style={S.empty.title}>No Results</Text>
              <Text style={S.empty.body}>No positions found for {activeTab}.</Text>
            </View>
          ) : (
            groupedSections.map(({ college, positions }) => (
              <CollegeSection key={college} college={college} positions={positions} S={S} />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
