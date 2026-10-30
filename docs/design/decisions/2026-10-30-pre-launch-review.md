# The pre-launch review runs alongside other work and covers code and docs too
30 Oct 2026, #1349. Decided by the maintainer.

A read-only review of the whole app runs before launch, in parallel with other work rather than
pausing it. It covers the code and the docs as well as the screens. Findings that are broken or
unsafe are fixed by Claude without asking. Findings that only change how something looks are
batched into one list for the maintainer to approve before anything is built. Tap-count cuts are
made only when each takes under a day; anything bigger becomes an issue marked `later` (for
example #1350, the jobs that still need a scroll on a phone).

First cut under this rule: "Mark not available" opens with the staff names already listed, so
recording a therapist's leave is 6 taps, on target, instead of 7.
