# Residents come in from a spreadsheet; the team stays typed

13 Oct 2026, #741, decided by the maintainer.

Centres keep their resident list in Excel or Google Sheets, so bulk upload takes a CSV saved from either, or rows copied and pasted, with columns name, gender, arriving, leaving and phone matched loosely by header. Rows that do not fit (no gender, leaving already past, a date that cannot be read) are shown in red beside the ready ones and fixed with a tap before one Save; nothing is skipped silently. Built in two parts: a server endpoint that checks the rows with the patient rules, then the screen in Make it mine step 3 and on Residents. Left out: the team by file (5–10 therapists are quicker to type), other booking systems' exports until a centre asks.
