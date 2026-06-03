import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { X } from 'lucide-react';
import { translations } from '../lib/i18n';

const analyticsConfirmButtonClass = 'px-4 py-2 text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-colors shadow-sm shadow-emerald-500/20';
const defaultConfirmButtonClass = 'px-4 py-2 text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors shadow-sm';
const analyticsCancelButtonClass = 'px-2 py-2 text-xs font-medium text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 rounded-xl transition-colors';
const defaultCancelButtonClass = 'px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors';

export function GlobalAlert() {
  const { alertData, clearAlert, language } = useAppStore();
  const t = translations[language];

  if (!alertData) return null;
  const isAnalyticsConsent = alertData.variant === 'analytics-consent';

  const handleClose = () => {
    if (alertData.onCancel) {
      alertData.onCancel();
    }
    clearAlert();
  };

  const handleConfirm = () => {
    if (alertData.onConfirm) {
      alertData.onConfirm();
    }
    clearAlert();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm transition-opacity">
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">
            {alertData.title || (alertData.isConfirm ? t.confirm : t.alert)}
          </h3>
          {!alertData.isConfirm && (
            <button 
              onClick={handleClose}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <X size={20} />
            </button>
          )}
        </div>
        
        <div className="p-5 text-slate-600 dark:text-slate-300 text-sm whitespace-pre-wrap">
          {alertData.message}
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
          {alertData.isConfirm && (
              <button 
              onClick={handleClose}
              className={isAnalyticsConsent ? analyticsCancelButtonClass : defaultCancelButtonClass}
            >
              {alertData.cancelText || t.cancel}
            </button>
          )}
          <button 
            onClick={alertData.isConfirm ? handleConfirm : handleClose}
            className={isAnalyticsConsent ? analyticsConfirmButtonClass : defaultConfirmButtonClass}
          >
            {alertData.isConfirm ? (alertData.confirmText || t.confirm) : t.ok}
          </button>
        </div>
      </div>
    </div>
  );
}
