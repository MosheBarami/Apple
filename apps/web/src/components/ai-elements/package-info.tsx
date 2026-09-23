// AI Elements `package-info`, re-implemented for this app.
//
// Upstream (vercel/ai-elements, Apache-2.0, see ./NOTICE) is a card for one dependency: its name, a
// change badge (major / minor / patch / added / removed), `current → new` versions and a
// description. Export names follow upstream; written here, dependency-free.
//
// Where it is used: the header of a version comparison in the Files drawer — the file's name,
// "Version 2 → Version 4", and a badge saying how much changed (picks/tech/version-diff.tsx).
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './lib/utils';
import './package-info.css';

export type ChangeType = 'major' | 'minor' | 'patch' | 'added' | 'removed';

export type PackageInfoProps = HTMLAttributes<HTMLDivElement> & {
  name: string;
  currentVersion?: string;
  newVersion?: string;
  changeType?: ChangeType;
};

export const PackageInfo = ({ name, currentVersion, newVersion, changeType, className, children, ...props }: PackageInfoProps) => (
  <div className={cn('ai-pkg', className)} {...props}>
    {children ?? (
      <>
        <PackageInfoHeader>
          <PackageInfoName>{name}</PackageInfoName>
          {changeType && <PackageInfoChangeType type={changeType} />}
        </PackageInfoHeader>
        {(currentVersion || newVersion) && <PackageInfoVersion current={currentVersion} next={newVersion} />}
      </>
    )}
  </div>
);

export const PackageInfoHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-pkg__header', className)} {...props} />
);

export const PackageInfoName = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('ai-pkg__name', className)} {...props} />
);

const CHANGE_LABEL: Record<ChangeType, string> = { major: 'Major', minor: 'Minor', patch: 'Patch', added: 'Added', removed: 'Removed' };

export const PackageInfoChangeType = ({ type, children, className }: { type: ChangeType; children?: ReactNode; className?: string }) => (
  <span className={cn('ai-pkg__change', `ai-pkg__change--${type}`, className)}>{children ?? CHANGE_LABEL[type]}</span>
);

export const PackageInfoVersion = ({ current, next, className }: { current?: string; next?: string; className?: string }) => (
  <p className={cn('ai-pkg__version', className)}>
    {current && <span className="ai-pkg__from">{current}</span>}
    {current && next && <span aria-hidden="true" className="ai-pkg__arrow">→</span>}
    {current && next && <span className="tq-sr"> to </span>}
    {next && <span className="ai-pkg__to">{next}</span>}
  </p>
);

export const PackageInfoDescription = ({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('ai-pkg__description', className)} {...props} />
);

export const PackageInfoContent = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-pkg__content', className)} {...props} />
);
