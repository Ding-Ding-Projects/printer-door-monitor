# Roadmap

## Setup from another app, 1.1.0

- [x] Let Bambu Studio set the printer, chimes and a first password through docker exec, never replacing a chosen password.
- [x] Answer with a one-time sign-in link so the page opens signed in.

## First version

- [x] Watch the four door sensors over the printer's LAN MQTT link, with first-run setup and a password.
- [x] Log every opening and closing with the open time, searchable with plain text or a regular expression.
- [x] Ring the door chimes on the printer, never while it prints, with Preview.
- [x] English, Cantonese and bilingual text, light and dark themes.
- [x] Image for x86-64 and ARM64, compose.yaml, host.bat with background and log modes, local or over SSH.
- [x] Portable setup wizard that deploys locally or to a Docker host over SSH.
- [ ] Confirm the door readings and the chimes on a real H2C.
- [ ] A full regular expression builder for the log search (today: a plain or regular expression switch).
- [ ] Notifications to a phone when a door stays open.
