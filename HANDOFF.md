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

Published: image `ghcr.io/ding-ding-projects/printer-door-monitor:1.0.0` for amd64 and arm64
(pulls without a login), release `v1.0.0-1` with `PrinterDoorMonitorSetup-1.0.0.exe` (one
portable file), its checksum, `compose.yaml`, `host.bat` and `scripts/host.ps1`, and the
documentation site on GitHub Pages.

Checked after publishing: `host.bat --detached` pulled 1.0.0 and started it on a local Docker
Desktop and on an ARM64 Docker host over SSH, and on both the health check passed and the page
answered from another computer on the network. Before publishing, the built wizard exe deployed
to both kinds of target from its own buttons, `host.bat --logs` showed the status and logs and
its pause and leave keys worked with the monitor left running, and unreachable hosts or missing
images failed with a clear message and exit code 1.

Not checked: a real H2C. The door bits are the decoding Bambu Studio uses, and some firmware only
allows LAN connections from other software in LAN-only or developer mode.
