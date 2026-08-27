$ErrorActionPreference = 'Stop'
$archive = 'ackrate-fleet-corridor-authority.zip'
try {
  Invoke-WebRequest -Uri 'https://staging.ackrate.com/starters/v1/fleet-corridor-authority.zip' -OutFile $archive
  node -e "const f='ackrate-fleet-corridor-authority.zip',e='9cd081dc0267aa16e9184a608da0bebd9dc327134d8b095764912faa6f0ee947',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
