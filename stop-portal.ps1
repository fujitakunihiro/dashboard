$ErrorActionPreference = "Stop"
$projectDir = $PSScriptRoot
$pidPath = Join-Path $projectDir "control-api\control-api.pid"

if (Test-Path -LiteralPath $pidPath) {
    $apiPid = 0
    if ([int]::TryParse((Get-Content -LiteralPath $pidPath -Raw).Trim(), [ref]$apiPid)) {
        $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $apiPid" -ErrorAction SilentlyContinue
        if ($processInfo -and $processInfo.CommandLine -like "*control-api*server.mjs*") {
            Stop-Process -Id $apiPid -Force
            Write-Host "Docker 操作 API を停止しました。"
        }
    }
    Remove-Item -LiteralPath $pidPath -Force
}

Push-Location $projectDir
try {
    docker compose down
    if ($LASTEXITCODE -ne 0) { throw "docker compose down に失敗しました。" }
} finally {
    Pop-Location
}
