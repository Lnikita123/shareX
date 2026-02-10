"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface UserContextType {
  username: string | null;
  setUsername: (name: string) => void;
  hasUsername: boolean;
}

const UserContext = createContext<UserContextType>({
  username: null,
  setUsername: () => {},
  hasUsername: false,
});

const STORAGE_KEY = "codenest_username";

export function UserProvider({ children }: { children: ReactNode }) {
  const [username, setUsernameState] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setUsernameState(stored);
    }
    setLoaded(true);
  }, []);

  const setUsername = useCallback((name: string) => {
    const trimmed = name.trim().slice(0, 20);
    if (trimmed.length >= 2) {
      setUsernameState(trimmed);
      localStorage.setItem(STORAGE_KEY, trimmed);
    }
  }, []);

  if (!loaded) return null;

  return (
    <UserContext.Provider value={{ username, setUsername, hasUsername: !!username }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
