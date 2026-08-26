$ErrorActionPreference = 'Stop'
$archive = 'ackrate-multi-agent-workflow.zip'
try {
  Invoke-WebRequest -Uri 'https://reapp.live/starters/v1/multi-agent-workflow.zip' -OutFile $archive
  node -e "const f='ackrate-multi-agent-workflow.zip',e='3fdcfbdfa1374cfb0977c2128e48e9252877631adc893ca98db324b2254961c8',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
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
