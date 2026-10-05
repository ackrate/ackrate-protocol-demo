#!/bin/sh
set -eu
archive='ackrate-coding-agent-purchase-hook.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/coding-agent-purchase-hook.zip'
node -e "const f='ackrate-coding-agent-purchase-hook.zip',e='064d72637310bb075b106f3f4333d64b532fd074d00c3d0a2994030d705a5ceb',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
