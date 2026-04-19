import { useState, useCallback } from "react";
import { getUuid, setUuid } from "../api/client";

export function useAuth() {
  const [uuid] = useState(() => getUuid());

  const importUuid = useCallback((newUuid: string) => {
    setUuid(newUuid);
  }, []);

  return { uuid, importUuid };
}
