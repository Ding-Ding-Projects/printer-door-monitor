# Printer Door Monitor agent instructions

- `server/` is a dependency-light Node web app (only `mqtt`). Run `npm test` in `server/` after
  every change there.
- Never put a printer access code, password or any other credential in the repository, a log,
  an issue or a release. The app keeps them in its data volume only.
- Every push to `main` that touches `server/` publishes a new image, and one that touches the
  wizard, `compose.yaml`, `host.bat` or `scripts/` publishes a new release. Verify before pushing.
- Write bilingual commit messages: a concise English subject, then a playful Hong Kong Cantonese
  body, and end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Agent conversation vocabulary

Agents working in this repository use the shared private conversation vocabulary defined in
the maintainer's canonical agent instructions for every reply, including chat prose, visible
reasoning, status lines, and task or session titles. Read those instructions and apply them
in full. They are deliberately not restated here, because this file is part of this
repository's public record.

That vocabulary never appears in anything published. Keep it out of commit messages, branch
names, code, code comments, test names, documentation, this file, issues, pull requests,
discussions, release notes, published sites, logs, and every other file in this repository.
Published writing uses ordinary professional English, and exact technical identifiers always
keep their literal spelling. The single documented public-safe exception is named in those
canonical instructions; do not infer any other.

Scan any text bound for a public surface against that vocabulary before publishing it. A
reviewer cannot tell a correct release note from a leaking one by reading it, so the scan is
a step, not a habit.
