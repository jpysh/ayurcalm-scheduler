# #355 — Diet: picker in view, plan is the 8 meals, medication with the patient

Lite seed, 375×812, 6 Oct. Patient: Aarohi Das.

| Step | Before | After | Result |
|---|---|---|---|
| Diet sheet, first view | timeline, then four meals; the plans below the fold ([before](before-diet.png)) | timeline ("Used by 17 patients · Edit ›"), then **Change to** with every plan, one-line descriptions ([after](after-diet.png)) | pass |
| Below the plans | date, then plans ([before](before-diet-scrolled.png)) | Today / Tomorrow and Starts, Medication and notes, Meals today ([after](after-diet-scrolled.png)) | pass |
| Medication and notes | on the plan, for everyone on it ([before](before-plan-editor-end.png)) | the patient's own page ([after](after-own.png)), saved ([after](after-own-saved.png)) | pass |
| Plan editor | 8 meals + medication + 2 notes | 8 meals only ([after](after-plan-editor-end.png)) | pass |
| Running plan's step | set the date | opens the plan editor ([after](after-timeline-edit.png)) | pass |
| Day sheet | plan headings carried "As prescribed…" and "Treatment: …" for everyone | each patient's own: Aarohi Das prints "Triphala at night. Treatment: Nothing heavy two hours before"; purification patients their own lines; 2 pages either way | pass |
| Taps: change meals from a date / meals today / edit a plan | 3 / 3 / 4 | 3 / 3 / 4 (the +1 scroll on the card is from #362) | same |
