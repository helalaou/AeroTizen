param([Parameter(Mandatory=$true)][string]$PlanPath)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$updatePlan = Get-Content -LiteralPath $PlanPath -Raw | ConvertFrom-Json
$updateStage = [IO.Path]::GetDirectoryName($PlanPath)
$updateLock = $null
$replaced = $false
$result = @{state='failed'; version=$updatePlan.version; backup=$updatePlan.backup}

function FileHash([string]$Path) {
    # Avoid optional script cmdlets from the caller's inherited PSModulePath.
    $algorithm = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try {
        return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    } finally {
        $stream.Dispose()
        $algorithm.Dispose()
    }
}
function CheckVersion([string]$Path, [string]$Version) {
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $Path
    $start.Arguments = '--version'
    $start.UseShellExecute = $false
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.CreateNoWindow = $true
    $start.EnvironmentVariables['PYINSTALLER_RESET_ENVIRONMENT'] = '1'
    $process = [Diagnostics.Process]::Start($start)
    try {
        if (-not $process.WaitForExit(45000)) {
            & "$env:SystemRoot\System32\taskkill.exe" /PID $process.Id /T /F | Out-Null
            $process.WaitForExit()
            throw 'The replacement CLI version check timed out.'
        }
        $text = $process.StandardOutput.ReadToEnd().Trim()
        if ($process.ExitCode -ne 0 -or $text -ne "aerotizen $Version") {
            throw 'The replacement CLI did not report the expected version.'
        }
    } finally { $process.Dispose() }
}

try {
    if ([IO.Path]::GetFullPath($updatePlan.candidate) -ne [IO.Path]::Combine($updateStage, 'aerotizen.exe')) {
        throw 'Invalid update staging path.'
    }
    [IO.File]::WriteAllText([IO.Path]::Combine($updateStage, 'ready'), 'ready')
    Wait-Process -Id $updatePlan.parent -Timeout 45 -ErrorAction SilentlyContinue
    if (Get-Process -Id $updatePlan.parent -ErrorAction SilentlyContinue) { throw 'The original CLI is still running.' }
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ($null -eq $updateLock) {
        try { $updateLock = [IO.File]::Open($updatePlan.lock, 'OpenOrCreate', 'ReadWrite', 'None') }
        catch [IO.IOException] {
            if ([DateTime]::UtcNow -ge $deadline) { throw }
            Start-Sleep -Milliseconds 100
        }
    }
    if ((FileHash $updatePlan.target) -ne $updatePlan.old_hash -or (FileHash $updatePlan.candidate) -ne $updatePlan.new_hash) {
        throw 'The installed or staged CLI changed; replacement stopped.'
    }
    if (Test-Path -LiteralPath $updatePlan.backup) { throw 'The backup path already exists.' }
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while (-not $replaced) {
        try {
            [IO.File]::Replace($updatePlan.candidate, $updatePlan.target, $updatePlan.backup)
            $replaced = $true
        } catch [IO.IOException] {
            if ([DateTime]::UtcNow -ge $deadline) { throw }
            Start-Sleep -Milliseconds 100
        }
    }
    if ((FileHash $updatePlan.target) -ne $updatePlan.new_hash -or (FileHash $updatePlan.backup) -ne $updatePlan.old_hash) {
        throw 'The replacement or backup checksum changed.'
    }
    CheckVersion $updatePlan.target $updatePlan.version
    $result.state = 'complete'
    Write-Output "Updated CLI to $($updatePlan.version). Previous executable: $($updatePlan.backup)"
} catch {
    $result.error = $_.Exception.Message
    if ($replaced) {
        try {
            $deadline = [DateTime]::UtcNow.AddSeconds(30)
            while ($true) {
                try {
                    # Windows PowerShell converts a plain $null string argument to an empty path.
                    [IO.File]::Replace($updatePlan.backup, $updatePlan.target, [System.Management.Automation.Language.NullString]::Value)
                    break
                } catch [IO.IOException] {
                    if ([DateTime]::UtcNow -ge $deadline) { throw }
                    Start-Sleep -Milliseconds 100
                }
            }
            $result.state = 'restored'
        } catch { $result.restore_error = $_.Exception.Message }
    }
    Write-Output "CLI update failed: $($result.error). Result: $($updatePlan.receipt)"
} finally {
    if ($null -ne $updateLock) { $updateLock.Dispose() }
    [IO.File]::WriteAllText($updatePlan.receipt, ($result | ConvertTo-Json))
    Remove-Item -LiteralPath $updateStage -Recurse -Force
}
