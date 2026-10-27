# Help pages are linked from empty states only, for now (27 Oct, #1312)

An empty state of a job with a help page carries a quiet "How this works" link to that page on GitHub (`Empty`'s `help` prop in the kit). Refusals stay as they are: they arrive as toasts with the server's reason, already one plain sentence, and linking them touches every call site. Revisit when the help bot (#1275) can answer inside the app.
