$ErrorActionPreference = 'Stop'
$archive = 'ackrate-coding-agent-purchase-hook.zip'
try {
  Invoke-WebRequest -Uri 'https://staging.ackrate.com/starters/v1/coding-agent-purchase-hook.zip' -OutFile $archive
  node -e "const f='ackrate-coding-agent-purchase-hook.zip',e='66e16c27be2f84dee90207086e463d9db0baaa3100647592de86c395c0d5b5a9',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
