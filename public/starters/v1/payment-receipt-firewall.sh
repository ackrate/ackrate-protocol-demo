#!/bin/sh
set -eu
archive='ackrate-payment-receipt-firewall.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/payment-receipt-firewall.zip'
node -e "const f='ackrate-payment-receipt-firewall.zip',e='3834d290b9fcbdf892688e31a92dd02dac8d2b335c4a9817c5f8d1a0763bdac1',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
