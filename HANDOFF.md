# Handoff

## First version, 12 November 2026

Printer Door Monitor: a Docker-hosted web app that watches the doors of a Bambu Lab printer
(written for the H2C) over its LAN MQTT link, logs every opening and closing, and rings the
door chimes from Bambu Studio MD3 on the printer's buzzer. Delivered as an image for x86-64 and
ARM64, a tracked `compose.yaml`, `host.bat` (menu, `--detached`, `--logs`, `--stop`,
`--remote user@host`), a portable setup wizard that deploys locally or over SSH, and a
documentation site.

Checked before the first push: the server unit tests (`npm test`, door decoding, edges, chime
G-code, sessions, and a regression test for a crash when the printer settings change while an
old connection is still waiting), and the built image against a stand-in printer (a TLS MQTT
broker): a front door opening and closing sent the Ding-dong and Dong-ding G-code and logged the
open time, and a door opened during a print was logged as waited without any command.

Not checked: a real H2C. The door bits are the decoding Bambu Studio uses, and some firmware only
allows LAN connections from other software in LAN-only or developer mode.
