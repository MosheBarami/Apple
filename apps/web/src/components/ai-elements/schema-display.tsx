// AI Elements `schema-display`, re-implemented for this app.
//
// Upstream (vercel/ai-elements, Apache-2.0, see ./NOTICE) shows an API's request/response bodies as
// a tree of named, typed properties, nested ones behind a disclosure. Export names follow upstream;
// written here with native <details> instead of Radix Collapsible.
//
// Where it is used: a JSON file opened in the Files drawer shows its "Data shape" — every field and
// what kind of value it holds — behind the Details fold (files-panel.tsx, picks/tech/json-shape.ts).
import type { HTMLAttributes } from 'react';
import { cn } from './lib/utils';
import type { SchemaProperty } from '../picks/tech/json-shape';
import './schema-display.css';

export type { SchemaProperty };

export type SchemaDisplayProps = HTMLAttributes<HTMLDivElement> & {
  title?: string;
  description?: string;
  properties: SchemaProperty[];
};

export const SchemaDisplay = ({ title, description, properties, className, ...props }: SchemaDisplayProps) => (
  <div className={cn('ai-schema', className)} {...props}>
    {(title || description) && (
      <SchemaDisplayHeader>
        {title && <span className="ai-schema__title">{title}</span>}
        {description && <SchemaDisplayDescription>{description}</SchemaDisplayDescription>}
      </SchemaDisplayHeader>
    )}
    <SchemaDisplayContent>
      {properties.length === 0 ? (
        <p className="ai-schema__none">No fields.</p>
      ) : (
        <ul className="ai-schema__list" role="list">
          {properties.map((p, i) => <SchemaDisplayProperty key={`${p.name}-${i}`} {...p} />)}
        </ul>
      )}
    </SchemaDisplayContent>
  </div>
);

export const SchemaDisplayHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-schema__header', className)} {...props} />
);

export const SchemaDisplayDescription = ({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('ai-schema__description', className)} {...props} />
);

export const SchemaDisplayContent = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-schema__content', className)} {...props} />
);

export const SchemaDisplayProperty = ({ name, type, properties, count }: SchemaProperty) => {
  const head = (
    <>
      <span className="ai-schema__name">{name}</span>
      <span className="ai-schema__type">{type}{count !== undefined ? ` · ${count}` : ''}</span>
    </>
  );
  if (!properties || properties.length === 0) {
    return <li className="ai-schema__prop"><span className="ai-schema__row">{head}</span></li>;
  }
  return (
    <li className="ai-schema__prop">
      <details className="ai-schema__nested">
        <summary className="ai-schema__row ai-schema__row--toggle">{head}</summary>
        <ul className="ai-schema__list ai-schema__list--nested" role="list">
          {properties.map((p, i) => <SchemaDisplayProperty key={`${p.name}-${i}`} {...p} />)}
        </ul>
      </details>
    </li>
  );
};
