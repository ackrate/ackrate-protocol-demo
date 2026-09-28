#!/bin/sh
set -eu
archive='ackrate-coding-agent-purchase-hook.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/coding-agent-purchase-hook.zip'
node -e "const f='ackrate-coding-agent-purchase-hook.zip',e='cb7145eb9d740c69752ade09cbe24278e43e276ac5035a373255d4332407dc71',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
