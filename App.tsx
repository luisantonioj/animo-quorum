/**
 * App.tsx — AnimoQuorum root
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsibilities:
 *   1. Restore persisted Supabase session on launch
 *   2. Listen for sign-in / sign-out events
 *   3. Request push notification permissions once on mount
 *   4. Wire notification tap listener (cleaned up on unmount)
 *   5. Wire provider tree around RootNavigator
 * ─────────────────────────────────────────────────────────────────────────────
 */
import 'react-native-gesture-handler';
import { useEffect }           from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider }    from 'react-native-safe-area-context';
import { StatusBar }           from 'expo-status-bar';
import { QueryProvider }       from './app/providers/QueryProvider';
import { RootNavigator }       from './app/navigation/RootNavigator';
import { supabase }            from './app/utils/supabase';
import {
  registerForNotificationsAsync,
  addNotificationResponseReceivedListener,
} from './app/notifications/notificationService';
import { useAuthStore } from './app/stores/authStore';
import { useVotingStore } from './app/stores/votingStore';
import { hydrateTheme } from './app/stores/themeStore';

export default function App() {
  const { setSession, setRole, setActiveRole, setProfile, setActiveCycleId, setInitialized, clear } = useAuthStore();

  useEffect(() => {
    // ── 0. Restore persisted theme preference ─────────────────────────────────
    hydrateTheme();

    // ── 1. Request notification permissions on mount ──────────────────────────
    registerForNotificationsAsync();

    // ── 2. Handle notification tap interactions ───────────────────────────────
    const unsubscribe = addNotificationResponseReceivedListener();

    // ── 3. Restore persisted session ─────────────────────────────────────────
    // onAuthStateChange handles session restore via INITIAL_SESSION / SIGNED_IN.
    // getSession is only needed as a fallback for the no-session case.
    //
    // If the persisted refresh token is stale (rotated, expired, or revoked
    // server-side), Supabase throws "AuthApiError: Invalid Refresh Token:
    // Refresh Token Not Found". We treat that as "no session" — wipe the
    // local token cache so the next launch is clean, and let RootNavigator
    // render the Auth stack.
    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (error) {
          const msg = error.message ?? '';
          if (msg.toLowerCase().includes('refresh token')) {
            supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          } else {
            console.warn('getSession error:', error);
          }
          setInitialized(true);
          return;
        }
        setInitialized(true);
      })
      .catch((e) => {
        const msg = e?.message ?? '';
        if (msg.toLowerCase().includes('refresh token')) {
          supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        } else {
          console.warn('getSession threw:', e);
        }
        setInitialized(true);
      });

    // ── 4. Auth state listener ────────────────────────────────────────────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {

        // Ignore undefined/noise events
        if (!_event) return;

        // Skip TOKEN_REFRESHED — only update session, don't re-fetch role
        if (_event === 'TOKEN_REFRESHED') {
          if (session) setSession(session);
          setInitialized(true);
          return;
        }

        try {
          if (session) {
            setSession(session);

            // Query 1 — fetch user profile
            const { data: userData, error: userError } = await supabase
              .from('Users')
              .select('*')
              .eq('auth_id', session.user.id)
              .single();

            if (userError) throw new Error(userError.message);

            if (userData) {
              // Query 2 — fetch roles separately
              const { data: rolesData, error: rolesError } = await supabase
                .from('UserRoles')
                .select('Roles(role_name)')
                .eq('user_id', userData.id);

              if (rolesError) throw new Error(rolesError.message);

              const roleNames = (rolesData ?? []).map((ur: any) => ur?.Roles?.role_name);
              const roleName  = roleNames.includes('Admin') ? 'Admin' : (roleNames[0] ?? 'Student');
              const resolvedRole = roleName === 'Admin' ? 'Admin' : 'Student';
              setRole(resolvedRole);
              setActiveRole(resolvedRole);
              setProfile(userData as any);

              const { data: activeCycle, error: cycleError } = await supabase
                .from('ElectionCycles')
                .select('id')
                .eq('status', 'active')
                .maybeSingle();

              if (cycleError) throw new Error(cycleError.message);
              setActiveCycleId(activeCycle?.id ?? null);
            }
          } else {
            clear();
          }
        } catch (e) {
          console.error('Auth error:', e);
        } finally {
          setInitialized(true);
        }
      }
    );

    return () => {
      unsubscribe();
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let previousActiveCycleId = useAuthStore.getState().activeCycleId;

    return useAuthStore.subscribe((state) => {
      if (state.activeCycleId === previousActiveCycleId) return;
      previousActiveCycleId = state.activeCycleId;
      useVotingStore.getState().reset();
    });
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <QueryProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </QueryProvider>
    </SafeAreaProvider>
  );
}
