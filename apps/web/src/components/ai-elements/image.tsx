// AI Elements `image`, re-implemented for this app.
//
// Upstream (vercel/ai-elements, Apache-2.0, see ./NOTICE) renders an AI SDK generated image — its
// `base64` bytes and `mediaType` — as an <img> with a data: URL. Export names and that shape follow
// upstream; `uint8Array` is dropped because nothing here hands one over (the bytes arrive as base64
// inside an authenticated JSON answer, which is also why a plain `src` URL would not work: an <img>
// cannot carry the person's token).
//
// Where it is used: the project's Branding window (routes/branding.tsx) shows the icon and
// thumbnails the worker composed from real Studio captures.
import type { ImgHTMLAttributes } from 'react';
import { cn } from './lib/utils';

export interface GeneratedImage {
  base64: string;
  mediaType: string;
}

export type ImageProps = GeneratedImage & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { alt: string };

export const Image = ({ base64, mediaType, className, alt, ...props }: ImageProps) => (
  <img {...props} alt={alt} className={cn('ai-elements-image', className)} src={`data:${mediaType};base64,${base64}`} />
);
