$ErrorActionPreference = 'Stop'
$archive = 'ackrate-fleet-corridor-authority.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.live/starters/v1/fleet-corridor-authority.zip' -OutFile $archive
  node -e "const f='ackrate-fleet-corridor-authority.zip',e='88d5dd845de8eb5ce18450937d66aab5e9cb7fe94a0a25a56daa3bfafcd25400',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
  if ($LASTEXITCODE -ne 0) { throw 'Starter integrity verification failed' }
  Expand-Archive -LiteralPath $archive -DestinationPath '.' -Force
  Remove-Item -LiteralPath $archive
  npm ci
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
  Write-Host ''
  Write-Host 'ACKRATE starter installed. Run: npm run demo'
} finally {
  if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
}
