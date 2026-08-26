#!/bin/sh
set -eu
archive='ackrate-procurement-guard.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/procurement-guard.zip'
node -e "const f='ackrate-procurement-guard.zip',e='f9fe620308a33ca5d6c569425b888ccfd4c120fdab773a90d758db44e63eea3e',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
