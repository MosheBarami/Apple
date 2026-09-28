// The project's branding (V3 gate G15): the worker's three routes, typed.
//
// Shapes mirror apps/worker/src/branding.ts. The art arrives as base64 SVG inside the JSON answer,
// because an <img src> cannot carry the person's token. A 409 with `state: 'needs_studio'` is an
// ANSWER (there are no real pictures of the game yet), not a failure; callers read it off
// ApiError.body. Nothing here publishes anything: the worker never uploads to Roblox.
import { ApiError } from './api';
import { getAccessToken } from './supabase';

export interface BrandingCapture {
  imageId: string;
  source: 'studio_viewport' | 'software_render';
  view: string;
  width: number;
  height: number;
  capturedAt: string;
}

export interface BrandingRecord {
  v: 1;
  names: string[];
  selectedName: string;
  shortDescription: string;
  longDescription: string;
  tagline: string;
  accent: string;
  captures: BrandingCapture[];
  generatedAt: string;
  updatedAt: string;
}

export interface BrandingArt {
  id: string;
  kind: 'icon' | 'thumbnail';
  captureImageId: string;
  width: number;
  height: number;
  mediaType: 'image/svg+xml';
  base64: string;
  provenance: string;
}

export interface BrandingPublish {
  published: false;
  uploadSupported: boolean;
  note: string;
}

export interface BrandingView {
  branding: BrandingRecord | null;
  art: BrandingArt[];
  publish: BrandingPublish;
}

export interface BrandingGenerated extends BrandingView {
  captured: 'fresh' | 'reused';
  modelCalls: number;
}

/** The fields a person edits. */
export type BrandingEdit = Pick<BrandingRecord, 'selectedName' | 'shortDescription' | 'longDescription' | 'tagline'>;

const path = (projectId: string, tail = '') => `/api/projects/${encodeURIComponent(projectId)}/branding${tail}`;

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch {
    throw new ApiError('Network error - check your connection.', 0);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const error = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : `Request failed (${res.status})`;
    throw new ApiError(error, res.status, body);
  }
  return body as T;
}

export const fetchBranding = (projectId: string): Promise<BrandingView> => call(path(projectId));

export const generateBranding = (projectId: string): Promise<BrandingGenerated> => call(path(projectId, '/generate'), { method: 'POST' });

export const saveBranding = (projectId: string, edit: BrandingEdit): Promise<BrandingView> =>
  call(path(projectId), { method: 'PUT', body: JSON.stringify(edit) });

/** True when the worker refused because there are no real captures and Studio is not connected. */
export const needsStudio = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 409 && (error.body as { state?: unknown } | null)?.state === 'needs_studio';

/** The Branding window's address, with the router's /app basename. */
export const brandingWindowUrl = (projectId: string) => `/app/projects/${encodeURIComponent(projectId)}/branding`;

/** Open the Branding details in their own window; where popups are blocked, go there instead. */
export function openBrandingWindow(projectId: string): void {
  const url = brandingWindowUrl(projectId);
  const opened = window.open(url, `branding-${projectId}`, 'popup,width=1180,height=900');
  if (!opened) window.location.assign(url);
}
