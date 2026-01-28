import { useState, useEffect, useRef, useCallback } from "react";

export type SaveState = "idle" | "pending" | "saved";

/**
 * Hook that debounces a callback function and tracks save state.
 * Returns [localValue, setLocalValue, saveState]
 * - localValue: current local value for instant UI
 * - setLocalValue: update local value (triggers debounced save)
 * - saveState: 'idle' | 'pending' | 'saved'
 */
export function useDebouncedCallback<T>(
  externalValue: T,
  callback: (value: T) => void,
  delay: number = 1000
): [T, (value: T) => void, SaveState] {
  const [localValue, setLocalValue] = useState<T>(externalValue);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  // Keep callback ref updated
  callbackRef.current = callback;

  // Sync local value when external value changes (e.g., reset from parent)
  useEffect(() => {
    setLocalValue(externalValue);
    setSaveState("idle");
  }, [externalValue]);

  const setValue = useCallback(
    (value: T) => {
      setLocalValue(value);
      setSaveState("pending");

      // Clear existing timeouts
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (savedTimeoutRef.current) {
        clearTimeout(savedTimeoutRef.current);
      }

      // Set new timeout for save
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(value);
        setSaveState("saved");

        // Clear saved state after 1.5 seconds
        savedTimeoutRef.current = setTimeout(() => {
          setSaveState("idle");
        }, 1500);
      }, delay);
    },
    [delay]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (savedTimeoutRef.current) {
        clearTimeout(savedTimeoutRef.current);
      }
    };
  }, []);

  return [localValue, setValue, saveState];
}
