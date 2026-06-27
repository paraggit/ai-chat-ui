import { useCallback, useState } from 'react';
import {
  isConfigured,
  loadModelSettings,
  saveModelSettings,
} from '../utils/modelSettings.js';

/**
 * @returns {{
 *   settings: { apiKey: string, model: string, endpoint: string },
 *   configured: boolean,
 *   updateSettings: (next: { apiKey: string, model: string, endpoint: string }) => void,
 * }}
 */
export function useModelSettings() {
  const [settings, setSettings] = useState(loadModelSettings);

  const updateSettings = useCallback((next) => {
    saveModelSettings(next);
    setSettings(next);
  }, []);

  return {
    settings,
    configured: isConfigured(settings),
    updateSettings,
  };
}
