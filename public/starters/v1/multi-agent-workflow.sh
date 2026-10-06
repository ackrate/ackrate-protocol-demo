#!/bin/sh
set -eu
archive='ackrate-multi-agent-workflow.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/multi-agent-workflow.zip'
node -e "const f='ackrate-multi-agent-workflow.zip',e='f0de4e798a1d915923c3ce27c5814270439efb324fc3a0adc3907a0db830ccb9',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
