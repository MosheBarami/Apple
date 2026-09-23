// One Roblox Studio object icon, drawn from the sprite strip (assets/studio-icons, PROVENANCE.md).
//
// Decorative: the row's own words name what happened, so the icon is aria-hidden and carries no
// text of its own. The cell is chosen by a custom property, so the component is a span and a
// number — no image request per row, and nothing here that a server render cannot produce.
import type { CSSProperties } from 'react';
import { STUDIO_ICON_CLASSES, studioIconIndex } from './studio-icon-model.ts';
import './studio-icon.css';

export function StudioIcon({ robloxClass, className }: { robloxClass: string | null | undefined; className?: string }) {
  const index = studioIconIndex(robloxClass);
  return (
    <span
      aria-hidden="true"
      className={`studio-icon${className ? ` ${className}` : ''}`}
      data-roblox-class={STUDIO_ICON_CLASSES[index]}
      style={{ '--studio-icon-i': index } as CSSProperties}
    />
  );
}
