#!/bin/sh
set -eu
archive='reapp-coding-agent-purchase-hook.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/coding-agent-purchase-hook.zip'
node -e "const f='reapp-coding-agent-purchase-hook.zip',e='75af2dc3f0bcf6ac380ae460fd10509d043bfdaa88da28203d525a6830eaef5e',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nREAPP starter installed. Run: npm run demo\n'
