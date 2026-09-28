$ErrorActionPreference = 'Stop'
$archive = 'ackrate-api-tollgate.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.ackrate.com/starters/v1/api-tollgate.zip' -OutFile $archive
  node -e "const f='ackrate-api-tollgate.zip',e='6b967263533254f27b54aea10f2f2efe078c4b82a91b1cadd4bc6cc605599e2f',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
