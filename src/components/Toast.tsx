import { useEffect, useState } from 'react';

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2800);
    return () => clearTimeout(t);
  }, [msg]);
  return { toast: msg ? <div className="toast" role="status">{msg}</div> : null, show: setMsg };
}
