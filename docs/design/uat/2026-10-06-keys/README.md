# Keyboard and focus pass (#311)

Base http://localhost:8098, 375x812, keyboard only (Tab, Escape). 49 pass, 0 fail. Written by scripts/keys.mjs.

| Check | Result | Read off the page |
|---|---|---|
| The day: Tab order | pass | 30 stops; out of order: none |
| The day: focus ring on every stop | pass | all show one |
| Patients: Tab order | pass | 30 stops; out of order: none |
| Patients: focus ring on every stop | pass | all show one |
| Team and rooms: Tab order | pass | 30 stops; out of order: none |
| Team and rooms: focus ring on every stop | pass | all show one |
| Leave: Tab order | pass | 29 stops; out of order: none |
| Leave: focus ring on every stop | pass | all show one |
| Diet plans: Tab order | pass | 9 stops; out of order: none |
| Diet plans: focus ring on every stop | pass | all show one |
| Settings: Tab order | pass | 16 stops; out of order: none |
| Settings: focus ring on every stop | pass | all show one |
| Log: Tab order | pass | 4 stops; out of order: none |
| Log: focus ring on every stop | pass | all show one |
| Menu: focus stays inside | pass | 11 stops; outside: none |
| Menu: Tab order top to bottom | pass | ok |
| Menu: focus ring on every stop | pass | all show one |
| Menu: Escape closes it and focus is not lost | pass | focus on "Menu" |
| Booking sheet: focus stays inside | pass | 25 stops; outside: none |
| Booking sheet: Tab order top to bottom | pass | ok |
| Booking sheet: focus ring on every stop | pass | all show one |
| Booking sheet: Escape closes it and focus is not lost | pass | focus on "Book a treatment" |
| New patient: focus stays inside | pass | 25 stops; outside: none |
| New patient: Tab order top to bottom | pass | ok |
| New patient: focus ring on every stop | pass | all show one |
| New patient: Escape closes it and focus is not lost | pass | focus on "New patient" |
| Add leave: focus stays inside | pass | 25 stops; outside: none |
| Add leave: Tab order top to bottom | pass | ok |
| Add leave: focus ring on every stop | pass | all show one |
| Add leave: Escape closes the top sheet only | pass | sheets 1 → 2 → 1 |
| Add leave: Escape closes it and focus is not lost | pass | focus on "Add leave" |
| Add to the team: focus stays inside | pass | 5 stops; outside: none |
| Add to the team: Tab order top to bottom | pass | ok |
| Add to the team: focus ring on every stop | pass | all show one |
| Add to the team: Escape closes it and focus is not lost | pass | focus on "Add to the team" |
| Treatment card: focus stays inside | pass | 3 stops; outside: none |
| Treatment card: Tab order top to bottom | pass | ok |
| Treatment card: focus ring on every stop | pass | all show one |
| Treatment card: Escape closes it and focus is not lost | pass | focus on "09:00 09:20 Krishna Singh Agni Snehapana" |
| Change day: focus stays inside | pass | 25 stops; outside: none |
| Change day: Tab order top to bottom | pass | ok |
| Change day: focus ring on every stop | pass | all show one |
| Change day: Escape closes it and focus is not lost | pass | focus on "Menu" |
| Backups: focus stays inside | pass | 4 stops; outside: none |
| Backups: Tab order top to bottom | pass | ok |
| Backups: focus ring on every stop | pass | all show one |
| Backups: Escape closes it and focus is not lost | pass | focus on "Backups Last backup less than an hour ag" |
| Search: the field has focus when it opens | pass | focus on "Search" |
| Search: Escape leaves it | pass | bar back |

## Found and fixed in this PR

Before: 9 of the 49 checks failed.
- Closing any sheet (Menu, booking, New patient, Add leave, Add to the team, treatment card, Change day, Backups) with Escape left the keyboard focus on nothing; the next Tab started again from the top of the page. Now focus returns to what opened the sheet, or to the Menu button when that has gone.
- Escape did nothing in Search (only Cancel left it); now Escape leaves it and focus goes to the Menu button.
- Date boxes (Arriving, Leaving, From, To, Pick a date) first read as "no ring": a false alarm of the script, which now checks the wrapper too. Each does ring its box.
- By design, left: the sheet's own Close is last in the Tab order but sits at the top (read out, never drawn).
Not run: reduced motion (the Tailwind motion-reduce rule is in index.css; no animation is needed to use the app).
