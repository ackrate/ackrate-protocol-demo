$ErrorActionPreference = 'Stop'
$archive = 'ackrate-build-notary.zip'
try {
  Invoke-WebRequest -Uri 'https://staging.ackrate.com/starters/v1/build-notary.zip' -OutFile $archive
  node -e "const f='ackrate-build-notary.zip',e='92f35e920cb378c59c3272128c531b487981a5e3ecfa36449c9edc6aa2963b29',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
