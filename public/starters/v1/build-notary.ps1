$ErrorActionPreference = 'Stop'
$archive = 'reapp-build-notary.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.live/starters/v1/build-notary.zip' -OutFile $archive
  node -e "const f='reapp-build-notary.zip',e='b1b202f94c7d4c947b342386e0b8ad928f50967bd9eff73229067ffbd2332465',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
