#!/bin/sh
set -eu
archive='ackrate-multi-agent-workflow.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://staging.ackrate.com/starters/v1/multi-agent-workflow.zip'
node -e "const f='ackrate-multi-agent-workflow.zip',e='80bc71f675e96c900eca6e3b872eb664151cfe204ce1de114c95d04ce9e3514d',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
