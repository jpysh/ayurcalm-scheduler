# Adding several rooms or therapists at once (#973)

Decided 22 Oct 2026, from what the server requires today.

The Add room and Add therapist sheets have "Add several at once": one name a
line, typed or pasted. Rooms need only names; what is ticked under "What they
all have" goes to every one. Therapists need a name and a gender each, because
a guessed gender sends same-gender therapies to the wrong person (#568); role,
the therapies they give and the hours apply to all of them. Everything else is
fixed later from each row. The names are added one by one; if one fails, the
toast says how many went in before it, and those stay.

Therapies keep their library, which already adds many at once.
