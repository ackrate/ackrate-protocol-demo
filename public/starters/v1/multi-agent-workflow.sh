#!/bin/sh
set -eu
archive='reapp-multi-agent-workflow.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/multi-agent-workflow.zip'
node -e "const f='reapp-multi-agent-workflow.zip',e='ca50a86acba1bdd4c4476a1ba470e63c6fdcaecaf15ece308aa41135d0bcb25f',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nREAPP starter installed. Run: npm run demo\n'
