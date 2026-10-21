# "Too few therapists in" means fewer than usual

Decided by the maintainer on 21 Oct (#1029): one therapist is a normal centre.

Team warns for an hour only when fewer therapists are in than the centre usually
has then. "Usually" is every active therapist whose weekly hours cover that hour,
leave and time off ignored; so the warning appears only because someone who would
normally be in is away. A one-therapist centre is never warned for being small.

Also warned: an hour with a two-therapist treatment booked and fewer than two in.

Replaces the fixed "fewer than two" rule from #351. The rule lives in
`server/src/staffWeek.ts`; the screen only shows it.
