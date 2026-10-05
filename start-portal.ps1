$ErrorActionPreference = "Stop"

$projectDir = $PSScriptRoot
$apiPath = Join-Path $projectDir "control-api\server.mjs"
$tokenPath = Join-Path $projectDir "dashboard-control-token.txt"
$logsDir = Join-Path $projectDir "control-api\logs"
$pidPath = Join-Path $projectDir "control-api\control-api.pid"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js が見つかりません。Node.js をインストールしてから再実行してください。"
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker CLI が見つかりません。Docker Desktop を起動してから再実行してください。"
}

if (-not (Test-Path -LiteralPath $tokenPath)) {
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $bytes = New-Object byte[] 32
    $rng.GetBytes($bytes)
    $rng.Dispose()
    $token = [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
    [System.IO.File]::WriteAllText($tokenPath, $token, [System.Text.UTF8Encoding]::new($false))
    Write-Host "操作トークンを作成しました: $tokenPath"
}

$workspaceRoot = (Resolve-Path (Join-Path $projectDir "..")).Path
$env:DASHBOARD_WORKSPACE_ROOT = $workspaceRoot

$apiReady = $false
try {
    $apiReady = (Invoke-RestMethod -Uri "http://127.0.0.1:3178/health" -TimeoutSec 1) -eq "ok"
} catch { }

if (-not $apiReady) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
    $node = (Get-Command node).Source
    $process = Start-Process -FilePath $node -ArgumentList ('"' + $apiPath + '"') -WorkingDirectory $projectDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logsDir "stdout.log") -RedirectStandardError (Join-Path $logsDir "stderr.log")
    Set-Content -LiteralPath $pidPath -Value $process.Id -Encoding ascii

    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 500
        try {
            if ((Invoke-RestMethod -Uri "http://127.0.0.1:3178/health" -TimeoutSec 1) -eq "ok") {
                $apiReady = $true
                break
            }
        } catch { }
    }
}

if (-not $apiReady) {
    throw "Docker 操作 API を起動できませんでした。control-api\logs\stderr.log を確認してください。"
}

Push-Location $projectDir
try {
    docker compose up -d --build
    if ($LASTEXITCODE -ne 0) { throw "docker compose up に失敗しました。" }
} finally {
    Pop-Location
}

Write-Host "ポータルを起動しました: http://localhost:3000/"
Write-Host "ポータルの [コンテナ操作] を押し、$tokenPath の内容を入力すると操作できます。"
