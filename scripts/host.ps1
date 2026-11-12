# Printer Door Monitor host script, started by host.bat. It runs the published image with
# the tracked compose.yaml, on this computer or on a Docker host reached over SSH
# (DOCKER_HOST=ssh://user@host), waits for the health check, checks the page from this
# computer and prints the address to open.
param([Parameter(ValueFromRemainingArguments = $true)] [string[]] $Arguments)

# Native commands report through their exit codes; stderr from docker is normal output here.
$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
$Compose = Join-Path $Root 'compose.yaml'
$Container = 'printer-door-monitor'

$Mode = $null
$Remote = $null
$Port = 8790
$Tag = 'latest'
for ($i = 0; $i -lt $Arguments.Count; $i++) {
    switch ($Arguments[$i]) {
        '--detached' { $Mode = 'detached' }
        '--logs' { $Mode = 'logs' }
        '--stop' { $Mode = 'stop' }
        '--remote' { $Remote = $Arguments[++$i] }
        '--port' { $Port = [int]$Arguments[++$i] }
        '--tag' { $Tag = $Arguments[++$i] }
        default { Write-Host "Unknown option: $($Arguments[$i])" -ForegroundColor Red; exit 2 }
    }
}

function Fail([string] $Message) {
    Write-Host ''
    Write-Host "Failed: $Message" -ForegroundColor Red
    exit 1
}

function Use-Target {
    if ($script:Remote) {
        if ($script:Remote -notmatch '^[A-Za-z0-9._-]+@[A-Za-z0-9.:-]+$') { Fail "the remote target must look like user@host, not '$($script:Remote)'." }
        $env:DOCKER_HOST = "ssh://$($script:Remote)"
    } else {
        Remove-Item Env:DOCKER_HOST -ErrorAction SilentlyContinue
    }
    $env:DOOR_MONITOR_PORT = "$script:Port"
    $env:DOOR_MONITOR_TAG = $script:Tag
}

function Target-Name { if ($script:Remote) { $script:Remote } else { 'this computer' } }

function Lan-Address {
    if ($script:Remote) {
        $hostPart = $script:Remote.Split('@')[1]
        if ($hostPart -match '^\d+\.\d+\.\d+\.\d+$') { return $hostPart }
        try { return ([System.Net.Dns]::GetHostAddresses($hostPart) | Where-Object AddressFamily -eq 'InterNetwork' | Select-Object -First 1).IPAddressToString } catch { return $hostPart }
    }
    $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1
    if ($route) {
        $ip = Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($ip) { return $ip.IPAddress }
    }
    return '127.0.0.1'
}

function Check-Runtime {
    Write-Host "Checking Docker on $(Target-Name)..."
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail 'the docker command is not installed on this computer. Install Docker Desktop, then run this again.' }
    docker compose version *> $null
    if ($LASTEXITCODE -ne 0) { Fail 'Docker Compose is not available. Update Docker Desktop, then run this again.' }
    docker info --format '{{.ServerVersion}}' *> $null
    if ($LASTEXITCODE -ne 0) {
        if ($script:Remote) { Fail "Docker on $($script:Remote) cannot be reached over SSH. Check that 'ssh $($script:Remote) docker info' works without a password prompt." }
        Fail 'Docker is installed but not running. Start Docker Desktop, then run this again.'
    }
}

function Start-Monitor {
    Use-Target
    Check-Runtime
    Write-Host "Pulling ghcr.io/ding-ding-projects/printer-door-monitor:$script:Tag..."
    docker compose -f $Compose pull 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { Fail 'the image could not be pulled. Check the network and the version given with --tag.' }
    Write-Host 'Starting...'
    docker compose -f $Compose up -d 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { Fail "the monitor did not start. If port $script:Port is taken, run again with --port and another number." }
    Write-Host -NoNewline 'Waiting for the health check'
    $healthy = $false
    for ($n = 0; $n -lt 45; $n++) {
        $health = docker inspect --format '{{.State.Health.Status}}' $Container 2>$null
        if ($health -eq 'healthy') { $healthy = $true; break }
        Write-Host -NoNewline '.'
        Start-Sleep -Seconds 2
    }
    Write-Host ''
    if (-not $healthy) { Fail "the monitor started but did not report healthy within 90 seconds. Run 'host.bat --logs$(if ($script:Remote) { " --remote $($script:Remote)" })' to see why." }
    $url = "http://$(Lan-Address):$script:Port/"
    try {
        $reply = Invoke-RestMethod -Uri "${url}healthz" -TimeoutSec 8
        if (-not $reply.ok) { throw 'no ok' }
    } catch {
        Fail "the monitor is healthy inside Docker, but $url does not answer from this computer. Check the firewall on $(Target-Name)."
    }
    Write-Host ''
    Write-Host "Printer Door Monitor $($reply.version) is running on $(Target-Name)." -ForegroundColor Green
    Write-Host "Open: $url" -ForegroundColor Green
    return $url
}

function Stop-Monitor {
    Use-Target
    Check-Runtime
    docker compose -f $Compose stop 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { Fail 'the monitor could not be stopped.' }
    Write-Host 'Stopped. Its settings and door log are kept for the next start.' -ForegroundColor Green
}

# Live status and logs. F pauses or resumes following, S switches the service, R refreshes
# the status line, Q leaves the view. Leaving never stops the monitor.
function Watch-Logs([string] $Url) {
    $services = @(docker compose -f $Compose ps --services 2>$null | Where-Object { $_ })
    if ($services.Count -eq 0) { $services = @('door-monitor') }
    $index = 0
    $follow = $true
    $since = (Get-Date).ToUniversalTime().AddMinutes(-10).ToString('yyyy-MM-ddTHH:mm:ssZ')
    $redraw = $true
    while ($true) {
        $service = $services[$index]
        if ($redraw) {
            Clear-Host
            $state = docker compose -f $Compose ps --format '{{.Service}}: {{.State}} {{.Health}}' 2>$null
            Write-Host "Printer Door Monitor on $(Target-Name)   $Url" -ForegroundColor Cyan
            Write-Host ("Status: " + ($state -join '  '))
            Write-Host "Service: $service   [F] $(if ($follow) { 'pause' } else { 'follow' })   [S] switch service   [R] refresh   [Q] leave (keeps it running)" -ForegroundColor DarkGray
            Write-Host ('-' * 80) -ForegroundColor DarkGray
            $redraw = $false
        }
        if ($follow) {
            $now = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
            docker compose -f $Compose logs --no-color --since $since --until $now $service 2>$null | ForEach-Object { Write-Host $_ }
            $since = $now
        }
        $deadline = (Get-Date).AddSeconds(1)
        while ((Get-Date) -lt $deadline) {
            if ([Console]::KeyAvailable) {
                $key = [Console]::ReadKey($true).Key
                switch ($key) {
                    'Q' { Write-Host ''; Write-Host 'Left the log view. The monitor is still running.' -ForegroundColor Green; return }
                    'Escape' { Write-Host ''; Write-Host 'Left the log view. The monitor is still running.' -ForegroundColor Green; return }
                    'F' { $follow = -not $follow; $redraw = $true }
                    'S' { $index = ($index + 1) % $services.Count; $since = (Get-Date).ToUniversalTime().AddMinutes(-10).ToString('yyyy-MM-ddTHH:mm:ssZ'); $redraw = $true }
                    'R' { $redraw = $true }
                }
                break
            }
            Start-Sleep -Milliseconds 100
        }
    }
}

function Choose([string] $Title, [string[]] $Options) {
    Write-Host ''
    Write-Host $Title -ForegroundColor Cyan
    for ($i = 0; $i -lt $Options.Count; $i++) { Write-Host "  [$($i + 1)] $($Options[$i])" }
    while ($true) {
        $key = [Console]::ReadKey($true).KeyChar
        $n = [int]::TryParse("$key", [ref]$null)
        if ($n -and [int]"$key" -ge 1 -and [int]"$key" -le $Options.Count) { return [int]"$key" }
    }
}

if (-not $Mode) {
    Write-Host 'Printer Door Monitor' -ForegroundColor Cyan
    # The last SSH target is remembered on this computer only, never in the repository.
    $memory = Join-Path $env:LOCALAPPDATA 'PrinterDoorMonitor\last-remote.txt'
    $last = if (Test-Path $memory) { (Get-Content $memory -Raw).Trim() } else { '' }
    $options = @('This computer (local Docker)')
    if ($last) { $options += "$last over SSH" }
    $options += 'Another Docker host over SSH'
    $where = Choose 'Where should it run?' $options
    if ($last -and $where -eq 2) { $Remote = $last }
    elseif ($where -gt 1) {
        $Remote = (Read-Host 'SSH target (user@host)').Trim()
        New-Item -ItemType Directory -Force -Path (Split-Path $memory) | Out-Null
        Set-Content -Path $memory -Value $Remote
    }
    $what = Choose 'What should it do?' @('Start in the background', 'Start and watch status and logs', 'Stop', 'Quit')
    $Mode = @('detached', 'logs', 'stop', 'quit')[$what - 1]
    if ($Mode -eq 'quit') { exit 0 }
}

switch ($Mode) {
    'detached' { [void](Start-Monitor) }
    'logs' { $url = Start-Monitor; Watch-Logs $url }
    'stop' { Stop-Monitor }
}
exit 0
