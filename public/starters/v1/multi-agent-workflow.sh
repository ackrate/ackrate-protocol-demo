#!/bin/sh
set -eu
archive='ackrate-multi-agent-workflow.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/multi-agent-workflow.zip'
node -e "const f='ackrate-multi-agent-workflow.zip',e='3fdcfbdfa1374cfb0977c2128e48e9252877631adc893ca98db324b2254961c8',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
