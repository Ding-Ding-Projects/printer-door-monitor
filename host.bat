@echo off
rem Printer Door Monitor: one-click hosting with Docker on this computer or on another host over SSH.
rem
rem   host.bat                                  menu: pick the target and what to do
rem   host.bat --detached                       start in the background on this computer
rem   host.bat --logs                           start, then watch status and logs
rem   host.bat --stop                           stop the monitor (its data is kept)
rem   host.bat --remote user@host               any of the above on a Docker host over SSH
rem   host.bat --port 8790 --tag 1.0.0          host port and image version
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\host.ps1" %*
set "code=%ERRORLEVEL%"
if "%~1"=="" pause
exit /b %code%
