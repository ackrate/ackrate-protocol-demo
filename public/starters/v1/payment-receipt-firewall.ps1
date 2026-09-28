$ErrorActionPreference = 'Stop'
$archive = 'ackrate-payment-receipt-firewall.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.ackrate.com/starters/v1/payment-receipt-firewall.zip' -OutFile $archive
  node -e "const f='ackrate-payment-receipt-firewall.zip',e='faa82bf30d4cd6cf41d083e7993d78a326c831eb65f2fd71d6a86d66f5b00877',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
