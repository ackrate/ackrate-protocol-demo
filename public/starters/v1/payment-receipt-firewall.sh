#!/bin/sh
set -eu
archive='ackrate-payment-receipt-firewall.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/payment-receipt-firewall.zip'
node -e "const f='ackrate-payment-receipt-firewall.zip',e='575b8fb84303d892c4dc88bcc090513559798f609585158e56a9e1cdcb935c4a',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
