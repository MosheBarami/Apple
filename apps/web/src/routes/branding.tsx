// /projects/:id/branding - the project's store-page branding, in its own window (V3 gate G15).
//
// The worker makes everything: it captures the open place read-only, composes the icon and
// thumbnails from those real pictures, and has the model write names and descriptions. This page
// shows the saved result, lets the person edit the words, and saves them. It never publishes:
// uploading to Roblox stays a step the person takes on the Creator Dashboard.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrandingDetails, draftFrom, isDirty } from '../components/branding/branding-details';
import { ApiError } from '../lib/api';
import {
  fetchBranding,
  generateBranding,
  needsStudio,
  saveBranding,
  type BrandingArt,
  type BrandingEdit,
  type BrandingView,
} from '../lib/branding-api';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong.');

/** The composed art is SVG; Roblox takes PNG, so the browser draws it at full size and saves that. */
function downloadPng(art: BrandingArt, filename: string): void {
  const img = new window.Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = art.width;
    canvas.height = art.height;
    canvas.getContext('2d')?.drawImage(img, 0, 0, art.width, art.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  };
  img.src = `data:${art.mediaType};base64,${art.base64}`;
}

export function BrandingPage() {
  const projectId = useParams<{ id: string }>().id ?? '';
  const queryClient = useQueryClient();
  const key = ['branding', projectId];
  const [draft, setDraft] = useState<BrandingEdit | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);

  const branding = useQuery({ queryKey: key, queryFn: () => fetchBranding(projectId), enabled: projectId !== '', retry: false });

  // A fresh record (first load, a save, a regenerate) resets the form to what is stored.
  const stamp = branding.data?.branding?.updatedAt;
  useEffect(() => {
    setDraft(draftFrom(branding.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp]);

  const store = (view: BrandingView) => queryClient.setQueryData(key, view);

  const save = useMutation({
    mutationFn: (edit: BrandingEdit) => saveBranding(projectId, edit),
    onSuccess: (view) => {
      store(view);
      setMessage({ tone: 'info', text: 'Saved.' });
    },
    onError: (error) => setMessage({ tone: 'error', text: messageOf(error) }),
  });

  const generate = useMutation({
    mutationFn: () => generateBranding(projectId),
    onSuccess: (out) => {
      store({ branding: out.branding, art: out.art, publish: out.publish });
      setMessage({
        tone: 'info',
        text: out.captured === 'fresh' ? 'Made from new pictures of your game.' : 'Studio is not connected, so the pictures from last time were reused.',
      });
    },
    onError: (error) => setMessage({ tone: 'error', text: messageOf(error) }),
  });

  const regenerate = () => {
    if (isDirty(branding.data, draft) && !window.confirm('Regenerating replaces your unsaved edits. Continue?')) return;
    setMessage(null);
    generate.mutate();
  };

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Branding</h1>
          <p className="page-desc">A name, descriptions, an icon and thumbnails for this game's store page, made from real pictures of it.</p>
        </div>
        <Link to={`/projects/${encodeURIComponent(projectId)}`} className="btn">
          Back to the project
        </Link>
      </header>

      {branding.isPending ? (
        <div aria-busy="true">Loading branding...</div>
      ) : branding.isError ? (
        <p className="form-error" role="alert">
          {branding.error instanceof ApiError && branding.error.status === 404 ? 'This project was not found.' : messageOf(branding.error)}
        </p>
      ) : (
        <BrandingDetails
          view={branding.data}
          draft={draft}
          onDraft={setDraft}
          onSave={() => draft && save.mutate(draft)}
          onRegenerate={regenerate}
          onDownload={downloadPng}
          saving={save.isPending}
          generating={generate.isPending}
          message={generate.isError && needsStudio(generate.error) ? { tone: 'info', text: messageOf(generate.error) } : message}
        />
      )}
    </main>
  );
}
