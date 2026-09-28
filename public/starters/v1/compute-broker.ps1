$ErrorActionPreference = 'Stop'
$archive = 'ackrate-compute-broker.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.ackrate.com/starters/v1/compute-broker.zip' -OutFile $archive
  node -e "const f='ackrate-compute-broker.zip',e='a68ae73fa8b1ac0a89b3562004524f86096a1c3a4e0ebcbba8bd1f1bc664bfe6',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
