$ErrorActionPreference = 'Stop'
$archive = 'ackrate-coding-agent-purchase-hook.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.live/starters/v1/coding-agent-purchase-hook.zip' -OutFile $archive
  node -e "const f='ackrate-coding-agent-purchase-hook.zip',e='f7ccdf5b5f1d4b783ccf56cdafd71c55fbf58c86327c11a09e7505a2232c69b1',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
