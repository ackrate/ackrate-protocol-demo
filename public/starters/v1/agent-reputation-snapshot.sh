#!/bin/sh
set -eu
archive='ackrate-agent-reputation-snapshot.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/agent-reputation-snapshot.zip'
node -e "const f='ackrate-agent-reputation-snapshot.zip',e='2eb937b71d72bed60c762a115cbd2fc1d9aecb5cdbf93a41edb9e1ebf9bde6c8',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
