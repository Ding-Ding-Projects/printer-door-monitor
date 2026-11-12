# Printer Door Monitor

A small web app that watches the doors of a Bambu Lab printer over its LAN link. It shows each
door (front door, top cover, left and right doors) as open or closed, keeps a log of every
opening and closing with how long the door stayed open, and can ring a chime on the printer's
buzzer when a door opens and another when it closes. Chimes wait while the printer is printing.
It was written for the Bambu Lab H2C and runs in Docker, so it keeps watching while every
computer with Bambu Studio is closed.

Documentation site: https://ding-ding-projects.github.io/printer-door-monitor/

## Run it

Pick one of three ways. All of them use the published image
`ghcr.io/ding-ding-projects/printer-door-monitor` (x86-64 and ARM64) and the tracked
[compose.yaml](compose.yaml), and keep the settings and the door log in the
`door-monitor-data` volume.

- **Setup wizard (GUI).** Download `PrinterDoorMonitorSetup-<version>.exe` from the latest
  [release](https://github.com/Ding-Ding-Projects/printer-door-monitor/releases/latest). It is a
  single portable file. Choose this computer or a Docker host over SSH (for example
  `docker@my-docker-host`), check Docker, pick the port and version, and install. It pulls the
  image, starts it, waits for the health check and opens the page from this computer before it
  says it is done.
- **host.bat.** Double-click it for a menu, or run it with options:

  ```bat
  host.bat --detached
  host.bat --logs
  host.bat --detached --remote docker@my-docker-host
  host.bat --stop --remote docker@my-docker-host
  host.bat --detached --port 8791 --tag 1.0.0
  ```

  `--detached` starts the monitor in the background and prints its address. `--logs` starts it
  and then shows its status and logs: F pauses or resumes following, S switches the service,
  R refreshes, Q leaves the view and keeps the monitor running. `--stop` stops it and keeps its
  data. `--remote` runs any of these on a Docker host over SSH, using your existing SSH key.
- **Docker Compose.**

  ```sh
  docker compose pull
  docker compose up -d
  ```

  `DOOR_MONITOR_PORT` (default 8790) and `DOOR_MONITOR_TAG` (default `latest`) change the
  port and the version.

Then open `http://<host IP>:8790/`.

## First run

The page starts with a short setup:

1. **Password.** Choose the password for the page. The first visitor sets it.
2. **Printer.** Enter the printer's IP address, serial number and LAN access code, all shown on
   the printer screen under its network settings. The monitor connects at once and shows whether
   it worked. The access code stays on the server; the page never shows it again.
3. **Chimes.** Turn the chime on, pick one for opening and one for closing, try each with
   Preview, and choose which doors ring. This step can be skipped.

### Set up from Bambu Studio in one click

The Device page of the Material Design build of Bambu Studio has a **Door monitor** section in
its Door chime card. **Set up door monitor** does all of the above without any typing: it runs the
published image on this computer or on a Docker host over SSH, waits for it to be healthy, fills in
the printer selected in Bambu Studio (IP address, serial number, LAN access code) and the chimes
chosen in the card, and opens the page already signed in. It sets a random password only when the
monitor has none, and never replaces one someone already chose.

This works through `docker exec`: the server writes a random provisioning key into its data
volume at every start, and `node src/provision-cli.mjs`, run inside the container, sends the
settings to the server over the container's own loopback with that key. Only someone who can
already run commands in the container can use it. The answer carries a one-time sign-in link that
works once, within five minutes:

```sh
echo '{}' | docker exec -i printer-door-monitor node src/provision-cli.mjs
```

The request takes `password`, `printer` (`host`, `serial`, `accessCode`), `chime` (`enabled`,
`open`, `close`, `doors`) and `setupDone`, all optional; `{}` only asks for a new sign-in link.

## How it works

The monitor connects to the printer's MQTT service on port 8883 with TLS, as user `bblp` with
the LAN access code, subscribes to `device/<serial>/report` and asks for a full report. It reads
the doors from bits 23 to 26 of `print.stat` (front door, top cover, left door, right door), with
bit 23 of `print.home_flag` as the fallback for the front door, and door detection support from
bit 12 of `print.fun`. This is the same decoding Bambu Studio uses; the printer maker does not
document it. The first reading after connecting only records the state, so a door that is already
open does not count as an opening.

A chime is sent as a `gcode_line` command: `M17`, `M400 S1`, `M1006` notes on all three buzzer
voices, `M1006 W`, `M18`. It turns the motors on and releases them afterwards, so it is never sent
while the printer is running, paused, preparing or slicing; the log records those as "waited,
printing".

Some printer firmware only allows LAN connections from other software in LAN-only mode or with
developer mode turned on. If the page shows a connection problem with the right IP, serial number
and access code, check that setting on the printer.

## Development

```sh
cd server
npm ci
npm test
npm start
```

`server/` is the web app, `wizard/` the setup wizard, `scripts/host.ps1` the script behind
`host.bat`, and `docs/` the documentation site.

## Status

See [HANDOFF.md](HANDOFF.md) and [ROADMAP.md](ROADMAP.md).
