$ErrorActionPreference = 'Stop'
$archive = 'ackrate-research-source-scout.zip'
try {
  Invoke-WebRequest -Uri 'https://staging.ackrate.com/starters/v1/research-source-scout.zip' -OutFile $archive
  node -e "const f='ackrate-research-source-scout.zip',e='6ba17ff2c7968722d1b32510313b05edacfa01f5a6b8a2fb2d639a7fda086e34',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
