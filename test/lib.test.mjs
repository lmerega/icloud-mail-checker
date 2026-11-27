import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { findVerificationCode } from '../lib/codes.js';
import { parseSender, normalizeThread } from '../background/icloud-api.js';
import { htmlToText, quoteForReply } from '../lib/text.js';
import { parseInvitation, buildReply } from '../lib/ics.js';

test('detects verification codes', () => {
  assert.equal(findVerificationCode('Your verification code is 482915'), '482915');
  assert.equal(findVerificationCode('Il tuo codice: 123 456'), '123456');
  assert.equal(findVerificationCode('Security code 2024 expires'), null);
  assert.equal(findVerificationCode('Order 12345 shipped'), null);
});

test('parses and answers invitations', () => {
  const ics = 'BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nBEGIN:VEVENT\r\nUID:u1\r\nSUMMARY:Sync\r\nDTSTART:20261201T100000Z\r\nORGANIZER;CN=A:mailto:a@example.invalid\r\nEND:VEVENT\r\nEND:VCALENDAR';
  const inv = parseInvitation(ics);
  assert.equal(inv.summary, 'Sync');
  assert.equal(inv.organizer, 'a@example.invalid');
  assert.equal(inv.start, '2026-12-01T10:00:00.000Z');
  assert.match(buildReply(inv, 'ACCEPTED', 'b@example.invalid'), /PARTSTAT=ACCEPTED/);
});

test('manifest and locales are consistent', () => {
  const m = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url)));
  assert.equal(m.manifest_version, 3);
  const en = JSON.parse(fs.readFileSync(new URL('../_locales/en/messages.json', import.meta.url)));
  const it = JSON.parse(fs.readFileSync(new URL('../_locales/it/messages.json', import.meta.url)));
  assert.deepEqual(Object.keys(en).sort(), Object.keys(it).sort());
  for (const f of Object.values(m.icons)) assert.ok(fs.existsSync(new URL('../' + f, import.meta.url)));
});

test('parses thread digests', () => {
  assert.deepEqual(parseSender('"Acme & Co." <a@x.invalid>'), { name: 'Acme & Co.', address: 'a@x.invalid' });
  const m = normalizeThread({ threadId: 't1', senders: ['B <b@x.invalid>'], flags: ['\\Seen'], timestamp: 0 }, 'INBOX');
  assert.equal(m.unread, false);
});

test('html to text decodes entities and keeps lines', () => {
  const s = htmlToText('<p>Hello&nbsp;&#160;world &amp; co</p><p>Line&#8212;two</p>');
  assert.equal(s, 'Hello world & co\nLine—two');
  assert.equal(quoteForReply('a\n\nb'), '> a\n>\n> b');
});
