$ErrorActionPreference = 'Stop'
$archive = 'ackrate-agent-reputation-snapshot.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.live/starters/v1/agent-reputation-snapshot.zip' -OutFile $archive
  node -e "const f='ackrate-agent-reputation-snapshot.zip',e='2eb937b71d72bed60c762a115cbd2fc1d9aecb5cdbf93a41edb9e1ebf9bde6c8',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
