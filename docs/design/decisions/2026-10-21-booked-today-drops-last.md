# A therapy already booked that day drops to the end of the booking list
21 Oct 2026, #1028, decided by the maintainer.

When booking a treatment, a therapy the patient already has that day is never offered first as "Same as last time". It drops below the others, greyed and marked with its time ("Booked 10:00"), and stays bookable for the rare second session. "Same as last time" goes only to a therapy not yet booked that day. The facts come from `therapyFacts` in `server/src/cardChoices.ts`; the order is in `src/components/TreatmentCard.tsx`.
