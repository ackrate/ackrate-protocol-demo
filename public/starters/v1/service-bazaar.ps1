$ErrorActionPreference = 'Stop'
$archive = 'ackrate-service-bazaar.zip'
try {
  Invoke-WebRequest -Uri 'https://staging.ackrate.com/starters/v1/service-bazaar.zip' -OutFile $archive
  node -e "const f='ackrate-service-bazaar.zip',e='d93d1f81773f385775186d3ac1967b6e94c96d037e5427a0f21c0fbd0c8bdb10',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
