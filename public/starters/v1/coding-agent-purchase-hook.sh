#!/bin/sh
set -eu
archive='ackrate-coding-agent-purchase-hook.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://staging.ackrate.com/starters/v1/coding-agent-purchase-hook.zip'
node -e "const f='ackrate-coding-agent-purchase-hook.zip',e='f7ccdf5b5f1d4b783ccf56cdafd71c55fbf58c86327c11a09e7505a2232c69b1',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
