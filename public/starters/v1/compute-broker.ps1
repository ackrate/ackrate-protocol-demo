$ErrorActionPreference = 'Stop'
$archive = 'ackrate-compute-broker.zip'
try {
  Invoke-WebRequest -Uri 'https://staging.ackrate.com/starters/v1/compute-broker.zip' -OutFile $archive
  node -e "const f='ackrate-compute-broker.zip',e='df9464d642938c35b5611e571ab63a3d6b052033a93501cfd5d2425274b825b5',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
