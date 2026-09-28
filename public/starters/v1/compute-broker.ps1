$ErrorActionPreference = 'Stop'
$archive = 'ackrate-compute-broker.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.ackrate.com/starters/v1/compute-broker.zip' -OutFile $archive
  node -e "const f='ackrate-compute-broker.zip',e='0f40434e8b61bbf04cb495c543227dbf66a5f1e7ebe3af28719f9ba0c37bd18a',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
