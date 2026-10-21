# "Full from" gives the server's reason (#1023)

**Decided 21 Oct by the maintainer:** the "Full from" line under the week gives the server's own
reason, in the server's words; the screen never writes its own.

What the reproduction found: the room's equipment was not the cause. A centre with no therapist
in was reported as "no therapist has a free hour", and the Staff week did not ask again after a
therapist was added, so the line stayed after Lakshmi was in.

- `/day-full` now returns `why` with each day: "no therapist has a free hour", or "no therapist is in".
- The Staff week asks again whenever the staff list changes.
- Rooms and skills stay out of "Full from" (#979): the booking sheet already names those per therapy.
