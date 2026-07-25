$ErrorActionPreference = 'Stop'
$archive = 'reapp-agent-reputation-snapshot.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.live/starters/v1/agent-reputation-snapshot.zip' -OutFile $archive
  node -e "const f='reapp-agent-reputation-snapshot.zip',e='71ee9274e44ea42ce9c010f3d9d89d27ae88b9025fa08042aebd40807d774409',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
  if ($LASTEXITCODE -ne 0) { throw 'Starter integrity verification failed' }
  Expand-Archive -LiteralPath $archive -DestinationPath '.' -Force
  Remove-Item -LiteralPath $archive
  npm ci
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
  Write-Host ''
  Write-Host 'REAPP starter installed. Run: npm run demo'
} finally {
  if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
}
