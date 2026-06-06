import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useAppStore } from '../store/useAppStore';

export function usePwaUpdate() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  const showAlert = useAppStore(state => state.showAlert);

  useEffect(() => {
    if (!needRefresh) return;
    showAlert({
      title: 'Update available',
      message: 'A new version of Mojo is ready.',
      isConfirm: true,
      confirmText: 'Reload',
      cancelText: 'Later',
      onConfirm: () => updateServiceWorker(true),
    });
  }, [needRefresh, showAlert, updateServiceWorker]);
}
