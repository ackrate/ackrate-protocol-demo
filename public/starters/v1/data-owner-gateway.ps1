$ErrorActionPreference = 'Stop'
$archive = 'ackrate-data-owner-gateway.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.ackrate.com/starters/v1/data-owner-gateway.zip' -OutFile $archive
  node -e "const f='ackrate-data-owner-gateway.zip',e='f1cc45c63c26177e8f1c81b1f2a38eb18799c4e895af814f07f9293464037704',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
