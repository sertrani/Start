import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);

  const reload = useCallback(async () => {
    try {
      const res = await api.get("/settings");
      setSettings(res.data);
    } catch (e) {}
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <SettingsContext.Provider value={{ settings, reload }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
