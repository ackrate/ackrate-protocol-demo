#!/bin/sh
set -eu
archive='ackrate-compute-broker.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/compute-broker.zip'
node -e "const f='ackrate-compute-broker.zip',e='d99308ca6b9300ffc787dffddfdad49943ad0c89dff051fef851e54107965911',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
