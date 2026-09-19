import { useEffect, useRef, useState } from 'react';

type ObjectUrlValue = { url: string };

/**
 * Holds a value that owns a `blob:` / object URL and revokes it on clear or unmount.
 * Prevents leaking object URLs when PDF previews are replaced or the page navigates away.
 */
export function useObjectUrlState<T extends ObjectUrlValue>() {
  const [value, setValue] = useState<T | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  function revoke() {
    setValue((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }

  useEffect(() => {
    return () => {
      if (valueRef.current) URL.revokeObjectURL(valueRef.current.url);
    };
  }, []);

  return { value, setValue, revoke };
}
