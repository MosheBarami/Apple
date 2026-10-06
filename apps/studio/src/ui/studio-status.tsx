// Whether Studio is connected to this project, and the pairing code to connect it (the /app flow, rebuilt).
import { Button, Surface } from '@cloudflare/kumo';
import { CircleIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { pairingCode, studioLink, type PairingCode, type StudioLink } from './api.ts';

/** Whether Studio is connected to this project, read every 10 s (null until the first answer). */
export function useStudioLink(projectId: string): { link: StudioLink | null; refresh: () => void } {
  const [link, setLink] = useState<StudioLink | null>(null);
  const refresh = useCallback(() => void studioLink(projectId).then(setLink), [projectId]);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [refresh]);
  return { link, refresh };
}

export function StudioStatus({ projectId, link, refresh }: { projectId: string; link: StudioLink | null; refresh: () => void }) {
  const [code, setCode] = useState<PairingCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (link?.connected) setCode(null);
  }, [link?.connected]);

  const connect = async () => {
    setError(null);
    try {
      setCode(await pairingCode(projectId));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const connected = link?.connected === true;
  return (
    <div className="relative">
      <Button variant={connected ? 'ghost' : 'outline'} size="sm" onClick={connected ? refresh : connect}>
        <CircleIcon size={8} weight="fill" className={connected ? 'text-kumo-success' : 'text-kumo-inactive'} />
        {connected ? 'Studio connected' : 'Connect Studio'}
      </Button>
      {(code || error) && !connected && (
        <Surface className="absolute right-0 z-10 mt-2 w-72 rounded-xl border border-kumo-line p-4 text-sm shadow-lg">
          {error ? (
            <p className="text-kumo-danger">{error}</p>
          ) : (
            <>
              <p className="text-kumo-default">In Roblox Studio, open the StudPilot plugin and enter this code:</p>
              <p className="my-3 text-center font-mono text-2xl tracking-widest text-kumo-default">{code?.code}</p>
              <p className="text-kumo-subtle">It works once and expires in 10 minutes. This turns green when Studio connects.</p>
            </>
          )}
        </Surface>
      )}
    </div>
  );
}
