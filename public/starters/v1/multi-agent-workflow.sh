#!/bin/sh
set -eu
archive='ackrate-multi-agent-workflow.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://staging.ackrate.com/starters/v1/multi-agent-workflow.zip'
node -e "const f='ackrate-multi-agent-workflow.zip',e='7524a97af724805215285546f0a3f5bb50e9a793b798c06082ceb0b68b2339ee',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
