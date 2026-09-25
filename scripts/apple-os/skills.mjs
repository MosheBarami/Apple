// The dashboard and CLI share this registry. "planned" entries are deliberately not runnable.
export const SKILLS = Object.freeze([
  { id: 'owner-brief', title: 'דוח בעלים', state: 'ready', input: 'חוזה הקבלה, פעולת ההמשך ומצב האימון', output: 'דוח מתוארך ב־outputs/', cadence: 'על פי בקשה' },
  { id: 'vault-search', title: 'חיפוש בידע', state: 'ready', input: 'שאלה או מילות חיפוש', output: 'שורות מקור עם קובץ ומספר שורה', cadence: 'על פי בקשה' },
  { id: 'request-router', title: 'ניתוב בקשות', state: 'ready', input: 'בקשה כתובה או תמלול', output: 'נתיב 1/2/3 ומקור ההחלטה', cadence: 'בכל בקשה' },
  { id: 'local-transcription', title: 'תמלול מקומי', state: 'ready', input: 'קובץ קול מקומי', output: 'טקסט מ־Whisper בלי העלאה', cadence: 'על פי בקשה' },
  { id: 'visual-asset-review', title: 'סקירת נכסים וזכויות', state: 'planned', input: 'מועמדים מ־Creator Store וראיות רישיון', output: 'עד שלוש תצוגות לפני הוספה', cadence: 'לפני בניית משחק' },
  { id: 'studio-gauntlet', title: 'בניית Studio ובדיקת משחק', state: 'planned', input: 'מקום בדיקה מבודד ותיאור משחק', output: 'צילום, readback, משחק וביקורת חזותית', cadence: 'לפני שחרור' },
  { id: 'training-promotion-review', title: 'סקירת קידום מודל', state: 'planned', input: 'תוצאות זוגיות על אותם 38 תרחישים', output: 'החלטת קידום עם ראיות', cadence: 'אחרי אימון' },
  { id: 'release-readiness', title: 'מוכנות לשחרור', state: 'planned', input: 'CI, אתר חי, Plugin ו־Studio', output: 'החלטה שמסתמכת על שער הקבלה', cadence: 'לפני פריסה' },
]);
