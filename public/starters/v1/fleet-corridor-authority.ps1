$ErrorActionPreference = 'Stop'
$archive = 'ackrate-fleet-corridor-authority.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.ackrate.com/starters/v1/fleet-corridor-authority.zip' -OutFile $archive
  node -e "const f='ackrate-fleet-corridor-authority.zip',e='3170d6c768673a2efa479a9f6673475a63639e6e9bd9e87419c1bd4ce4ff8b27',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
