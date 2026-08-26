$ErrorActionPreference = 'Stop'
$archive = 'ackrate-api-tollgate.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.live/starters/v1/api-tollgate.zip' -OutFile $archive
  node -e "const f='ackrate-api-tollgate.zip',e='222a3e53a32408b28918932ca93741879df67ab18769aa51c04f65df6687ad2a',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
