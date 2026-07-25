$ErrorActionPreference = 'Stop'
$archive = 'reapp-payment-receipt-firewall.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.live/starters/v1/payment-receipt-firewall.zip' -OutFile $archive
  node -e "const f='reapp-payment-receipt-firewall.zip',e='6f2abc5a4e5d4e092a1dd63546b3030370628c49b4ed000e1629e2ea8401e188',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
