// THE MODEL PICKER — AI Elements' ModelSelector (components/ai-elements/model-selector.tsx, vendored
// at the pinned commit, see that directory's NOTICE): a dialog holding a searchable list, grouped
// Apple, Your keys and Free, each model with its vendor's own mark.
//
// Loaded lazily by the composer. The vendor marks and the command list are only needed once somebody
// opens the chip, and the composer is on the one page everybody loads first.
//
// What is chosen, and whether it can be, is decided by the composer (the entitlement rule, the key
// rule, the sentence a locked row raises). This file draws the rows model-picker-model.ts grouped
// and hands a choice back. A row that cannot be chosen says so twice: `aria-disabled` for a screen
// reader, and the reason itself as the row's second line for everybody else. It stays reachable, as
// the MAX row always has, because choosing it is how the reason gets said out loud.
//
// ITS MOTION IS TWO OF THE OWNER'S PICKS (components/picks/composer/model-list-fx.*): Motion's
// "Variants" — the panel opens from a sliver and the rows arrive one after another out of a blur,
// each carrying its place in the list as `--i` — and Animate UI's "Highlight", one backdrop that
// travels behind whichever row the keyboard or the pointer is on.
import { useState } from 'react';
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from '../ai-elements/model-selector';
import { Badge } from '../ai-elements/ui/badge';
import { CheckIcon } from '../ai-elements/icons';
import { ModelMark } from './model-mark';
import { ModelChipFace, ModelName } from './model-chip';
import type { PickerGroup, PickerRow } from './model-picker-model';
import { ModelListHighlight } from '../picks/composer/model-list-fx';
import './model-picker.css';

export interface ModelPickerProps {
  groups: readonly PickerGroup[];
  /** The id a send would use now: a built-in Apple id, or the catalogue id of a model on a key. */
  selected: string;
  /** The label to show when `selected` is not among the rows (the catalogue could not be read). */
  fallbackLabel: string;
  /** Returns true when the choice was taken, which closes the dialog. */
  onChoose: (row: PickerRow) => boolean;
  /** Absent means there is nowhere to send somebody to add a key, and no link is drawn. */
  onOpenSettings?: () => void;
}

function RowLogo({ row }: { row: PickerRow }) {
  if (row.group === 'apple') return <ModelMark variant={row.id === 'apple' ? 'apple' : 'max'} />;
  return <ModelSelectorLogo provider={row.logo ?? ''} label={row.vendor} />;
}

/**
 * The dialog's contents. Its own export so a test can render the open list (server rendering cannot
 * press the chip): `close` is what a taken choice or the Settings link calls.
 */
export function ModelPickerRows({
  groups,
  selected,
  onChoose,
  onOpenSettings,
  close,
}: Omit<ModelPickerProps, 'fallbackLabel'> & { close: () => void }) {
  const locked = groups.some((g) => g.id !== 'apple' && g.rows.some((row) => !row.available));
  // Each row's place in the whole list, for the staggered arrival.
  let place = 0;
  return (
    <ModelSelectorContent title="Choose a model" className="gx-model-picker">
      <ModelSelectorInput placeholder="Search models" aria-label="Search models" />
      <ModelSelectorList label="Models">
        <ModelListHighlight />
        <ModelSelectorEmpty>No model matches that.</ModelSelectorEmpty>
        {groups.map((group) => (
          <ModelSelectorGroup key={group.id} heading={group.heading}>
            {group.rows.map((row) => {
              const chosen = row.id === selected;
              const i = place++;
              return (
                <ModelSelectorItem
                  key={row.id}
                  value={row.label}
                  keywords={[row.vendor, row.id]}
                  aria-disabled={row.available ? undefined : true}
                  data-checked={chosen ? '' : undefined}
                  className={`gx-model-row${row.available ? '' : ' is-unavailable'}`}
                  style={{ ['--i' as string]: i }}
                  onSelect={() => {
                    if (onChoose(row)) close();
                  }}
                >
                  <RowLogo row={row} />
                  <span className="gx-model-row__main">
                    <ModelSelectorName className="gx-model-row__name">
                      <ModelName id={row.id} label={row.label} />
                    </ModelSelectorName>
                    <span className="gx-model-row__note">{row.note}</span>
                  </span>
                  {row.free && <Badge variant="outline" className="gx-model-row__free">Free</Badge>}
                  {chosen && (
                    <span className="gx-model-row__check">
                      <CheckIcon size={14} />
                      <span className="gx-sr">Selected</span>
                    </span>
                  )}
                </ModelSelectorItem>
              );
            })}
          </ModelSelectorGroup>
        ))}
      </ModelSelectorList>
      {locked && onOpenSettings && (
        <div className="gx-model-picker__foot">
          <button
            type="button"
            className="gx-model-picker__settings"
            onClick={() => {
              close();
              onOpenSettings();
            }}
          >
            Add your OpenRouter key in Settings
          </button>
        </div>
      )}
    </ModelSelectorContent>
  );
}

export default function ModelPicker({ groups, selected, fallbackLabel, onChoose, onOpenSettings }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const current = groups.flatMap((g) => g.rows).find((row) => row.id === selected);
  const label = current?.label ?? fallbackLabel;

  return (
    <ModelSelector open={open} onOpenChange={setOpen}>
      <ModelSelectorTrigger className="gx-chip gx-chip--model" aria-label={`Model: ${label}`} data-fx="press ripple" data-tip="Choose who does the work">
        <ModelChipFace id={selected} label={label} logo={current ? <RowLogo row={current} /> : undefined} />
      </ModelSelectorTrigger>
      {/* Mounted only while open, so the search starts empty every time it is opened. */}
      {open && (
        <ModelPickerRows groups={groups} selected={selected} onChoose={onChoose} onOpenSettings={onOpenSettings} close={() => setOpen(false)} />
      )}
    </ModelSelector>
  );
}
