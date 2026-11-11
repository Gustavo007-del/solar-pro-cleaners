import { useRef, useState } from 'react';

export function useSaveAction() {
  const saving = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save(action: () => Promise<void>) {
    if (saving.current) return;

    saving.current = true;
    setPending(true);
    setFailed(false);
    try {
      await action();
    } catch {
      setFailed(true);
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  return { pending, failed, save };
}
