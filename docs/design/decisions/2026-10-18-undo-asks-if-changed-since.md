# Undo asks first when the treatment was changed since
18 Oct 2026, #900, decided by the maintainer.

With one login on two phones, Undo on a treatment card sends the time it last saw. If the treatment changed since (the other phone, or a therapist's link), the server refuses with "It was changed since, on another phone or link." and the card offers "Undo anyway", which puts it back without the check. The guard still refuses any clash either way.

The same applies to the batch Undo (leave, "Not in", fix-it, Log, What needs you, stay shortened) and to stay Undos (dates, package, accommodation), #911. A batch is changed since when any of its treatments was saved after it; a stay when its dates, package or room are no longer what the save left.
