$ErrorActionPreference = 'Stop'
$archive = 'ackrate-model-route-bazaar.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.ackrate.com/starters/v1/model-route-bazaar.zip' -OutFile $archive
  node -e "const f='ackrate-model-route-bazaar.zip',e='a2b66bf8a902f69063dce9f6ba88f3c0210382cccc9bd349ead861342f5ec358',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
