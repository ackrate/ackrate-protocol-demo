#!/bin/sh
set -eu
archive='ackrate-research-source-scout.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/research-source-scout.zip'
node -e "const f='ackrate-research-source-scout.zip',e='2671100dfa6f48606976769c490793a7b577a5d3d4874d7c420f82a7c706518a',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
