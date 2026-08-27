$ErrorActionPreference = 'Stop'
$archive = 'ackrate-procurement-guard.zip'
try {
  Invoke-WebRequest -Uri 'https://staging.ackrate.com/starters/v1/procurement-guard.zip' -OutFile $archive
  node -e "const f='ackrate-procurement-guard.zip',e='d7aecd93944c2b5aae5197d2a129ddf1d5e64f7e2569b725b505e290f43b1e14',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
