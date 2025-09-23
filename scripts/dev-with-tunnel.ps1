$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

$port = 9002
$domain = 'mtman.ngrok-free.dev'

$refreshProc = $null

function Stop-DevProcesses {
    Get-Process -Name ngrok -ErrorAction SilentlyContinue | Stop-Process -Force
    Get-Process -Name node -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -and $_.Path -like '*spectrasync*' } |
        Stop-Process -Force
    $connections = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        $connections | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
            try { Stop-Process -Id $_ -Force } catch {}
        }
    }
}

function Start-VipRefreshLoop {
    if ($refreshProc -and !$refreshProc.HasExited) {
        return
    }

    Write-Host "Starting VIP refresh loop..." -ForegroundColor DarkCyan
    $refreshProc = Start-Process -FilePath cmd.exe `
        -ArgumentList '/c','npm','run','refresh:vip' `
        -PassThru `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden
}

function Stop-VipRefreshLoop {
    if ($refreshProc -and !$refreshProc.HasExited) {
        try { $refreshProc.CloseMainWindow() } catch {}
        Start-Sleep -Milliseconds 200
        try { $refreshProc | Stop-Process -Force } catch {}
    }
    $refreshProc = $null
}

function Run-NpmDev {
    & cmd.exe /c "npm run dev"
}

while ($true) {
    Stop-DevProcesses
    Write-Host "Starting dev environment..." -ForegroundColor Cyan
    $ngrokProc = Start-Process -FilePath ngrok -ArgumentList @('http', $port, '--domain', $domain) -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 3

    Start-VipRefreshLoop

    try {
        Run-NpmDev
    }
    finally {
        Stop-VipRefreshLoop
        if ($ngrokProc -and !$ngrokProc.HasExited) {
            try { $ngrokProc | Stop-Process -Force } catch {}
        }
        Stop-DevProcesses
    }

    while ($true) {
        $choice = Read-Host "Dev server stopped. Press Enter to restart or type Q to quit"
        if ([string]::IsNullOrWhiteSpace($choice)) {
            break
        }
        if ($choice -match '^(?i)npm\s+run\s+dev(:with-tunnel)?$' -or $choice -match '^(?i)(restart|reload|r)$') {
            break
        }
        if ($choice -match '^(?i)(q|quit|exit)$') {
            break 2
        }
        Write-Host "Unrecognized input. Press Enter to restart or type Q to quit." -ForegroundColor Yellow
    }
}
