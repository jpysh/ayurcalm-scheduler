// The maintainer's morning (#818): the business on one screen, and the one thing to do first.
const D = 86_400_000;
const n = (list, from, key = 'at') => list.filter((x) => x[key] && x[key] >= from).length;

// The weekly security routine's own one-line verdict, the first line of SECURITY.md (#1089).
export const security = (text, at, now) => (text && now - at < 8 * D ? text.split('\n')[0].trim() : 'Security: weekly check has not run for over a week');

// This service runs on a Node pinned by hand (~/.local), which no update moves: say when a centre's is newer (#1089).
const parts = (v) => v.replace(/^v/, '').split('.').map(Number);
const newer = (a, b) => { const [x, y] = [parts(a), parts(b)]; return x[0] === y[0] && (x[1] - y[1] || x[2] - y[2]) > 0; };
export function nodeLine(host, apps) {
  const top = apps.reduce((m, v) => (newer(v, m) ? v : m), host);
  return top === host ? `Node: ${host} on the host` : `Node: ${host} on the host, older than the centres' ${top}: update the host's Node`;
}

export function morning(db, problems, now, feedback = [], host = []) {
  const day = now - D, week = now - 7 * D;
  const live = db.centres.filter((c) => !c.paused_at);
  const ending = live.filter((c) => c.trial?.ends_at && !c.trial.plan && Date.parse(c.trial.ends_at) - now < 7 * D && Date.parse(c.trial.ends_at) > now);
  const left = (c) => Math.ceil((Date.parse(c.trial.ends_at) - now) / D);
  const silent = ending.filter((c) => !c.sheet_at && left(c) <= 3)[0];
  const push = problems.length ? `Fix: ${problems[0]}`
    : db.update?.failed ? `Fix: update ${db.update.sha} stopped at ${db.update.failed}`
    : silent ? `Call ${silent.centre} (${silent.email}): trial ends in ${left(silent)} days and they never printed their sheet`
    : feedback[0] && feedback[0].at >= day ? `Answer ${feedback[0].centre}: "${feedback[0].text.slice(0, 80)}"`
    : n(db.signups, week) < 3 ? 'Contact three centres today: sign-ups are under 3 this week'
    : 'Ask one trial centre what would make them pay';
  return [
    `Today's push: ${push}`,
    '',
    `Sign-ups: ${n(db.signups, day)} yesterday, ${n(db.signups, week)} this week`,
    `Came in: ${n(db.centres, week, 'signin_at')} · printed their own sheet: ${n(db.centres, week, 'sheet_at')} (this week)`,
    `Trials live: ${live.length} · paused: ${db.centres.length - live.length} · paying: ${db.centres.filter((c) => c.trial?.plan).length} · waiting list: ${db.waitlist.length}`,
    ending.length ? `Ending within 7 days: ${ending.map((c) => `${c.centre} (${left(c)} d${c.sheet_at ? '' : ', no sheet yet'})`).join(', ')}` : 'No trial ends this week',
    db.update?.failed ? `Update ${db.update.sha} stopped at ${db.update.failed}: ${db.update.why}` : db.update ? `Update: ${db.update.sha} everywhere` : null,
    ...((db.events || []).some((e) => e.at >= day) ? [`Since yesterday: ${db.events.filter((e) => e.at >= day).map((e) => e.text).join('; ')}`] : []),
    problems.length ? `Health: ${problems.join('; ')}` : 'Health: every centre up and backed up',
    ...host,
    db.tidy ? `Disk: ${db.tidy.after} full after the night's tidy (was ${db.tidy.before})${db.tidy.stopped.length ? `; stopped ${db.tidy.stopped.join(', ')}` : ''}${db.tidy.removed?.length ? `; removed ${db.tidy.removed.length} stopped test stack(s) with their data` : ''}` : null,
    feedback.length ? `Feedback this week: ${n(feedback, week)}${feedback.slice(0, 3).map((f) => `\n  ${f.centre}: ${f.text.slice(0, 120)}`).join('')}` : 'Feedback this week: none yet',
  ].filter((l) => l !== null).join('\n');
}
