#!/bin/sh
set -eu
archive='ackrate-procurement-guard.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/procurement-guard.zip'
node -e "const f='ackrate-procurement-guard.zip',e='7f487b8f8551fb55fba32c2d6dbfb2806c25de79d95f530ebf0dd7cf4a1d166b',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
