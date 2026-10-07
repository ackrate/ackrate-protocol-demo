$ErrorActionPreference = 'Stop'
$archive = 'ackrate-coding-agent-purchase-hook.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.ackrate.com/starters/v1/coding-agent-purchase-hook.zip' -OutFile $archive
  node -e "const f='ackrate-coding-agent-purchase-hook.zip',e='1219859533dd04f18c7aac930710507e214f1ad04ec3400e18ce1d6c7d5a1722',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
