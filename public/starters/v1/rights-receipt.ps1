$ErrorActionPreference = 'Stop'
$archive = 'ackrate-rights-receipt.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.ackrate.com/starters/v1/rights-receipt.zip' -OutFile $archive
  node -e "const f='ackrate-rights-receipt.zip',e='38605973226a34c6cafdb1b185f8f09e9bf9ba3eef5fb0117574794b273cefbc',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
