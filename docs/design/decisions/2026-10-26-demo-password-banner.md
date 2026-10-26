# Demo password: a line over every screen, not a chase (26 Oct)

**Decided.** An admin still signed in with demo1234 sees one line at the top of every screen: "You're still using the demo password. Change it". "Change it" opens Settings › Your account. There is no close; the line goes the moment the password changes. The public demo (DEMO_MODE) never shows it, because its password is meant to be known. (#1173)

**Why.** Babaji's pilot centre is still on the demo password. The maintainer chose not to chase them; the app reminds them instead, on every screen, until they change it.

**How.** The server already answers `GET /account` with `demo_password`, false on the public demo (#906), and tests both states. The screen only shows what that says. The line is the kit's `Strip`.
