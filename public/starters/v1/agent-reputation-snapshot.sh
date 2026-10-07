#!/bin/sh
set -eu
archive='ackrate-agent-reputation-snapshot.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/agent-reputation-snapshot.zip'
node -e "const f='ackrate-agent-reputation-snapshot.zip',e='989eadc66376aeeda0393013b353d63470d8e0b3d38cca608399c96dec0b0698',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
