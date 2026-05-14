import { useState, useCallback } from "react";
import { storage } from "../utils";

/**
 * localStorage 持久化状态 hook
 */
export function useStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => storage.get(key, initialValue));

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        storage.set(key, valueToStore);
      } catch (error) {
        console.warn(`Failed to set storage key "${key}":`, error);
      }
    },
    [key, storedValue]
  );

  return [storedValue, setValue] as const;
}
