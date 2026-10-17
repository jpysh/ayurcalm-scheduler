# The dev scripts name the stack; the compose file does not

17 Oct 2026, #824, decided by Claude, to confirm.

`npm run dev:*` and `npm run qa` always use the Docker project `ayurcalm-scheduler`, so a worktree cannot start a second stack beside the one on :8080. `docker-compose.yml` gets no `name:`, because the hosting Mac runs centres from it and a fixed name would rename their projects and leave their data volumes behind. Left out: a check that refuses to run when another project already holds the port.
