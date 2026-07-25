$ErrorActionPreference = 'Stop'
$archive = 'reapp-coding-agent-purchase-hook.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.live/starters/v1/coding-agent-purchase-hook.zip' -OutFile $archive
  node -e "const f='reapp-coding-agent-purchase-hook.zip',e='75af2dc3f0bcf6ac380ae460fd10509d043bfdaa88da28203d525a6830eaef5e',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
  if ($LASTEXITCODE -ne 0) { throw 'Starter integrity verification failed' }
  Expand-Archive -LiteralPath $archive -DestinationPath '.' -Force
  Remove-Item -LiteralPath $archive
  npm ci
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
  Write-Host ''
  Write-Host 'REAPP starter installed. Run: npm run demo'
} finally {
  if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
}
