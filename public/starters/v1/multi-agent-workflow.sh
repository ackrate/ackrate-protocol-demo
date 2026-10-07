#!/bin/sh
set -eu
archive='ackrate-multi-agent-workflow.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/multi-agent-workflow.zip'
node -e "const f='ackrate-multi-agent-workflow.zip',e='4dac6654a61f8a572c62fdc019ac8cd736cfa3e99cf2e0a6301c9c8a50448be5',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
