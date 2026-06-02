import { useEffect } from 'react';
import { startMojoAnalytics } from '../services/analyticsService';
import { useAppStore } from '../store/useAppStore';

export function useMojoAnalytics() {
  const analyticsConsent = useAppStore(state => state.analyticsConsent);
  const setAnalyticsOnlineUsers = useAppStore(state => state.setAnalyticsOnlineUsers);

  useEffect(() => {
    if (analyticsConsent !== true) {
      setAnalyticsOnlineUsers(0);
      return;
    }

    const stopAnalytics = startMojoAnalytics(setAnalyticsOnlineUsers);
    return () => {
      stopAnalytics?.();
    };
  }, [analyticsConsent, setAnalyticsOnlineUsers]);
}
