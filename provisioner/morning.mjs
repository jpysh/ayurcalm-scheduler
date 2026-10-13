// The maintainer's morning (#818): the business on one screen, and the one thing to do first.
const D = 86_400_000;
const n = (list, from, key = 'at') => list.filter((x) => x[key] && x[key] >= from).length;

export function morning(db, problems, now, feedback = []) {
  const day = now - D, week = now - 7 * D;
  const live = db.centres.filter((c) => !c.paused_at);
  const ending = live.filter((c) => c.trial?.ends_at && !c.trial.plan && Date.parse(c.trial.ends_at) - now < 7 * D && Date.parse(c.trial.ends_at) > now);
  const left = (c) => Math.ceil((Date.parse(c.trial.ends_at) - now) / D);
  const silent = ending.filter((c) => !c.sheet_at && left(c) <= 3)[0];
  const push = problems.length ? `Fix: ${problems[0]}`
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
    problems.length ? `Health: ${problems.join('; ')}` : 'Health: every centre up and backed up',
    feedback.length ? `Feedback this week: ${n(feedback, week)}${feedback.slice(0, 3).map((f) => `\n  ${f.centre}: ${f.text.slice(0, 120)}`).join('')}` : 'Feedback this week: none yet',
  ].join('\n');
}
