#!/bin/sh
set -eu
archive='ackrate-procurement-guard.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/procurement-guard.zip'
node -e "const f='ackrate-procurement-guard.zip',e='fb7a980e64d29633d16ef3b7ad96ace1686388d5b4247dc077f6d14da333a76e',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
