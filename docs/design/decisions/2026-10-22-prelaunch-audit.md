# Pre-launch audit: how it is run (22 Oct 2026)

Agreed with the maintainer in chat.

- One test patient, a 21-day Panchakarma resident, walked by real taps at 375x812, with a screenshot per step; an automated crawl touches every Menu screen, scroll and sheet and lists them.
- 50 things that go wrong (30 general, 20 particular to a residential Ayurveda centre), each with an expected outcome written before it is run, marked walked, covered by a test, or a gap.
- Screenshots are judged by a designer subagent that sees only the shots, DESIGN.md and STORIES.md, through critique, accessibility and copy.
- Bugs go one issue and one PR each (`ship`); UX findings are grouped per screen group (`polish-batch`); business calls are one-line questions on their issue.
- One session walks and files; one session per screen group fixes.
- The audit lives in `docs/design/audit/`, exempt from the weekly UAT clean-up.
