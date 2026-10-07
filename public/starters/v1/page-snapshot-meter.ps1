$ErrorActionPreference = 'Stop'
$archive = 'ackrate-page-snapshot-meter.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.ackrate.com/starters/v1/page-snapshot-meter.zip' -OutFile $archive
  node -e "const f='ackrate-page-snapshot-meter.zip',e='d1aa85af914b3ad41d1fce0f51cef1771824ce0c71bb36eea3ae816e851d5cba',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
