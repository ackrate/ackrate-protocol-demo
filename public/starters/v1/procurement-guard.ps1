$ErrorActionPreference = 'Stop'
$archive = 'ackrate-procurement-guard.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.ackrate.com/starters/v1/procurement-guard.zip' -OutFile $archive
  node -e "const f='ackrate-procurement-guard.zip',e='ef60d2b619aca51eb29d774243a0b73af56f15bcc80ccff94ae98a3bc30af3a0',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
