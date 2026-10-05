#!/bin/sh
set -eu
archive='ackrate-coding-agent-purchase-hook.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/coding-agent-purchase-hook.zip'
node -e "const f='ackrate-coding-agent-purchase-hook.zip',e='c04e1e2e2eb195be063b8b67464c869978babae19a2a5ca1a1b916132b9630a8',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
