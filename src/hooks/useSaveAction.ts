import { useRef, useState } from 'react';

export function useSaveAction() {
  const saving = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<unknown>();

  async function save(action: () => Promise<void>) {
    if (saving.current) return;

    saving.current = true;
    setPending(true);
    setFailed(false);
    setError(undefined);
    try {
      await action();
    } catch (failure) {
      setFailed(true);
      setError(failure);
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  return { pending, failed, error, save };
}
