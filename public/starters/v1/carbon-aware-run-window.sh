#!/bin/sh
set -eu
archive='ackrate-carbon-aware-run-window.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/carbon-aware-run-window.zip'
node -e "const f='ackrate-carbon-aware-run-window.zip',e='d835b281617831117c590a530c5adea969d004ed6a41f843f7faba4cf2101faf',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
