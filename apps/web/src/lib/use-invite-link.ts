// The invite link for the signed-in account, computed once the account is known, and a way to copy it.
import { useCallback, useEffect, useState } from 'react';
import { COPY_FAILED, INVITE_COPIED, inviteLink, referralCode } from './growth';
import { writeClipboard } from '../components/picks/chat/copy-button';
import { useToast } from '../components/toast';

export function useInviteLink(userId: string | null | undefined): { link: string | null; copy: () => Promise<boolean> } {
  const [link, setLink] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    setLink(null);
    void referralCode(userId).then((code) => {
      if (current) setLink(inviteLink(code));
    });
    return () => {
      current = false;
    };
  }, [userId]);
  const copy = useCallback(async () => (link ? writeClipboard(link) : false), [link]);
  return { link, copy };
}

/** The "Invite a friend to StudPilot" press: copy the link to StudPilot's sign-up page and say so, or say why not. Nothing else happens. */
export function useShareInvite(userId: string | null | undefined): { share: () => void } {
  const { link, copy } = useInviteLink(userId);
  const { toast } = useToast();
  const share = useCallback(() => {
    if (!link) {
      toast('The link is not ready yet. Try again in a moment.', 'info');
      return;
    }
    void copy().then((ok) => toast(ok ? INVITE_COPIED : COPY_FAILED, ok ? 'success' : 'error'));
  }, [link, copy, toast]);
  return { share };
}
