// The model chip's face: a mark, the model's name, the caret. Shared by the composer's placeholder
// (drawn while the picker's code is still arriving) and the picker's own trigger, so the two cannot
// show a different name for the same choice.
import type { ReactNode } from 'react';
import { Icon, PATH } from './primitives';
import { ModelMark } from './model-mark';

/** "Apple MAX" is the one name with its own identity (the owner's rainbow); every other name is text. */
export function ModelName({ id, label }: { id: string; label: string }) {
  if (id === 'apple-max') return <>Apple <span className="apple-max-name">MAX</span></>;
  return <>{label}</>;
}

/** Apple's own models carry Apple's mark; any other model is handed its vendor's `logo`. */
export function ModelChipFace({ id, label, logo }: { id: string; label: string; logo?: ReactNode }) {
  const apple = id === 'apple' || id === 'apple-max';
  return (
    <>
      {apple ? <ModelMark variant={id === 'apple' ? 'apple' : 'max'} /> : (logo ?? <span className="gx-chip__logo-slot" aria-hidden="true" />)}
      <span className="gx-chip__label"><ModelName id={id} label={label} /></span>
      <span className="gx-chip__caret" aria-hidden="true">
        <Icon d={PATH.chevronDown} size={11} />
      </span>
    </>
  );
}
