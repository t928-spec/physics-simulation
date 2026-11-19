# Optics Lab Implementation Plan

> Implement and verify each workstream in order.

**Goal** Add three interactive lab benches and a Google-authenticated classroom assessment workflow.

**Architecture** Static practice pages share measurement and graph code with the assessment page. A Node HTTPS-facing service validates Google identities, enforces classroom access, and stores assessment snapshots and grades in SQLite.

- [x] Test optics equations, geometry, statistics and regression in `tests/optics.test.mjs`. Implement in `optics/physics.js`.
- [x] Build `optics/index.html`, `optics/lab.js` and `optics/style.css`. Wire each bench and its data to the graph and validate common student flows.
- [x] Test classroom authorization, drafts, submission and grading. Implement the service in `optics/server.mjs` and connect the browser using `optics/classroom.js`.
- [x] Link the practice page from the homepage, document hosting and Google configuration, and run the repository test suite.
- [ ] Configure the school's Google OAuth application on the selected HTTPS host and verify sign-in with school accounts.
