#!/bin/sh
set -eu
archive='ackrate-procurement-guard.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/procurement-guard.zip'
node -e "const f='ackrate-procurement-guard.zip',e='ef60d2b619aca51eb29d774243a0b73af56f15bcc80ccff94ae98a3bc30af3a0',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
