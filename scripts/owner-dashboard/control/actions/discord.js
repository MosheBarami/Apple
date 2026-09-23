// Discord action specs. The only write is sending one message to a channel the bot can see; the
// composer on the page builds the spec from what the owner typed and runs it through ctx.act (confirm
// modal, then POST, dry-run aware). The server strips every mention (allowed_mentions parse:[]).
export const PATH = '/api/cc/discord/action';

export function send(ch, content, guildName) {
  const text = String(content ?? '').trim();
  const preview = text.length > 160 ? `${text.slice(0, 160)}…` : text;
  return { id: `dc-send-${ch.id}`, platform: 'discord', label: `שליחת הודעה ל-#${ch.name}`, hint: guildName || 'Discord',
    title: `לשלוח את ההודעה ל-#${ch.name}?`,
    what: `הבוט יפרסם בערוץ #${ch.name}${guildName ? ` בשרת ${guildName}` : ''} את ההודעה: "${preview}". אף אחד לא יתויג, גם אם כתוב בה @ או שם.`,
    undo: 'הודעה שנשלחה נמחקת מתוך Discord (לחיצה ימנית על ההודעה ← מחיקה). הלוח עצמו לא מוחק הודעות.',
    path: PATH, body: { kind: 'send', channelId: ch.id, content: text }, okMsg: `ההודעה נשלחה ל-#${ch.name}.`, confirmLabel: 'כן, לשלוח' };
}

// Sending needs text the owner types, so nothing here belongs in the Cmd/Ctrl+K palette.
export function catalog() { return []; }
