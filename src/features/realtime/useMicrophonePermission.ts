'use client';

import { useCallback, useState } from 'react';

export type MicrophonePermissionState =
  | 'unknown'
  | 'granted'
  | 'denied'
  | 'prompt';

export function useMicrophonePermission() {
  const [permission, setPermission] = useState<MicrophonePermissionState>('unknown');

  const probePermission = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
      return permission;
    }

    try {
      const result = await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      });
      const nextState = result.state as MicrophonePermissionState;
      setPermission(nextState);
      return nextState;
    } catch {
      return permission;
    }
  }, [permission]);

  return {
    permission,
    setPermission,
    probePermission,
  };
}
