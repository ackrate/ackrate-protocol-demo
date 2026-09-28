$ErrorActionPreference = 'Stop'
$archive = 'ackrate-agent-reputation-snapshot.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.ackrate.com/starters/v1/agent-reputation-snapshot.zip' -OutFile $archive
  node -e "const f='ackrate-agent-reputation-snapshot.zip',e='d2c4789b3f06be414714af747fc34afe7c87cf3885229c106d9d9039c7cd7368',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
