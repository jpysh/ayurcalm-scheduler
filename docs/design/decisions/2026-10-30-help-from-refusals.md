# Help links from refusals and sheet heads (#1338)

A refused booking, move or consultation shows "How this works" under its message, linking the story page that explains it. The reason-to-page list lives once in `kit.tsx` (`REFUSAL_HELP`): booking clashes go to s4, a therapist, room or patient out to s2, consultation refusals to s8. A new refusal reason is added there.

Stories without an empty screen link from their sheet head (`help` on `BottomSheet`/`InboxSheet`): Things to fix (s1), The plan (s2), Form C (s9). The "No free time" callout links s4.
