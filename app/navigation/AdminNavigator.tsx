import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { AdminDashboardScreen }  from '../screens/admin/AdminDashboardScreen';
import { AdminCandidatesScreen } from '../screens/admin/AdminCandidatesScreen';
import { AdminResultsScreen }    from '../screens/admin/AdminResultsScreen';
import { AdminSettingsScreen }   from '../screens/admin/AdminSettingsScreen';
import { useThemeColors } from '../theme';

import type { AdminTabParamList } from './types';

const Tab = createBottomTabNavigator<AdminTabParamList>();

export function AdminNavigator() {
  const C = useThemeColors();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor:   C.green,
        tabBarInactiveTintColor: C.textMuted,
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopColor:  C.border,
          borderTopWidth:  1,
        },
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
            AdminDashboard:  'home-outline',
            AdminCandidates: 'people-outline',
            AdminResults:    'bar-chart-outline',
            AdminSettings:   'person-outline',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="AdminDashboard"  component={AdminDashboardScreen}  options={{ title: 'Home' }}   />
      <Tab.Screen name="AdminCandidates" component={AdminCandidatesScreen} options={{ title: 'Candidates' }} />
      <Tab.Screen name="AdminResults"    component={AdminResultsScreen}    options={{ title: 'Results' }}    />
      <Tab.Screen name="AdminSettings"   component={AdminSettingsScreen}   options={{ title: 'Profile' }}   />
    </Tab.Navigator>
  );
}
