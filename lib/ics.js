// Minimal iCalendar (text/calendar) invitation parser.
function unfold(s) { return s.replace(/\r?\n[ \t]/g, ''); }

function parseDate(v) {
  const m = /^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)(Z)?)?$/.exec(v || '');
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0', z] = m;
  return z
    ? new Date(Date.UTC(+y, mo - 1, +d, +h, +mi, +s)).toISOString()
    : new Date(+y, mo - 1, +d, +h, +mi, +s).toISOString();
}

export function parseInvitation(ics) {
  if (!ics || !/BEGIN:VEVENT/i.test(ics)) return null;
  const body = unfold(ics);
  const get = (name) => {
    const m = new RegExp(`^${name}(?:;[^:\\r\\n]*)?:(.*)$`, 'im').exec(body);
    return m ? m[1].trim().replace(/\\n/gi, '\n').replace(/\\,/g, ',') : '';
  };
  return {
    method: get('METHOD') || 'REQUEST',
    uid: get('UID'),
    summary: get('SUMMARY'),
    location: get('LOCATION'),
    start: parseDate(get('DTSTART')),
    end: parseDate(get('DTEND')),
    organizer: get('ORGANIZER').replace(/^mailto:/i, '')
  };
}

export function buildReply(inv, partstat, attendee) {
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//zoho-mail-checker//EN', 'METHOD:REPLY',
    'BEGIN:VEVENT', `UID:${inv.uid}`, `DTSTAMP:${now}`,
    `ORGANIZER:mailto:${inv.organizer}`,
    `ATTENDEE;PARTSTAT=${partstat}:mailto:${attendee}`,
    `SUMMARY:${inv.summary}`, 'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
}
