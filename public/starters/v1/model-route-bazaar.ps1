$ErrorActionPreference = 'Stop'
$archive = 'ackrate-model-route-bazaar.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.ackrate.com/starters/v1/model-route-bazaar.zip' -OutFile $archive
  node -e "const f='ackrate-model-route-bazaar.zip',e='4f11a2e9369ec9a1522563f4f75a0d630d90fafa27443a4ae041b2896c99d2a3',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
