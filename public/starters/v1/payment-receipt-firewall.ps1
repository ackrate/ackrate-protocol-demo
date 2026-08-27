$ErrorActionPreference = 'Stop'
$archive = 'ackrate-payment-receipt-firewall.zip'
try {
  Invoke-WebRequest -Uri 'https://staging.ackrate.com/starters/v1/payment-receipt-firewall.zip' -OutFile $archive
  node -e "const f='ackrate-payment-receipt-firewall.zip',e='84fecbf8ce1edb6b3f652b2cce7c07376734aea615c577d7574015026a2e2c90',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
