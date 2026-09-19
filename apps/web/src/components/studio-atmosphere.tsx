import { useEffect, useState } from 'react';
import { useReducedMotion } from '../lib/theme';

// Decorative light, not progress. Static SVG geometry; animation only moves its wrapper.
const THREADS = Array.from({ length: 34 }, (_, i) => (
  `M-160 ${800 + i * 7} C260 ${470 + i * 5} 590 ${1060 - i * 6} 1050 ${810 - i * 5} S1510 ${620 - i * 4} 1900 ${670 - i * 3}`
));

export function StudioAtmosphere() {
  const reduced = useReducedMotion();
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return <div className={`studio-atmosphere${reduced || hidden ? ' is-still' : ''}`} aria-hidden="true">
    <div className="studio-atmosphere__beam" />
    <svg className="studio-atmosphere__mesh" viewBox="0 0 1720 1000" preserveAspectRatio="none" focusable="false">
      {THREADS.map((d, i) => <path key={i} d={d} />)}
    </svg>
    <div className="studio-atmosphere__dust" />
  </div>;
}
