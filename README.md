# XM4 web flasher


# Why

My WH-1000XM4 are a beautiful pair of headphones but hte left earcup ANC micrphones developed a fault and started letting out actually ear hurting ringing at times causing me to disable ANC which I was fine with, but the problem is that ANC is the default mode during headphone startup so if I forget to NOT put on headphones BEFORE turning it on, my ears are essentialy blasted with sharp blasts whcih actually makes them hurt for hte rest of the day. so I made this firmware flasher which explicitly disables ANC on startup. working great so far


# Main Soup

Local firmware flasher for the WH-1000XM4. Plain HTML and JavaScript, no build step, no backend, no native Bluetooth helper.

Open `index.html` in desktop Google Chrome. If that doesn't work, double-click `Open in Chrome.command` instead. That starts a tiny Python server on localhost and opens Chrome. Keep its terminal open while flashing; Control-C shuts it down.

Pair the headphones in macOS first, unplug the audio cable, and close any other headphone tools. Click **Use ANC-off patch**, then **Connect headphones**, and choose the XM4 in Chrome's device picker. Connecting only reads the staging layout and installed firmware fingerprint. **Review & flash** shows the warning; writing starts only after you accept it and type `FLASH`.

The included patch is the exact 2.9.0 package we installed and read back on this headset. It changes two bytes so ANC defaults to off after startup. It doesn't permanently disable ANC or repair the missing microphones. You can also pick the original 2.9.0 Sony `.bin` to restore stock behavior. Unknown packages and unrecognized installed firmware are rejected.

Charge the headphones first. This app can't read battery level. A failed update can brick them, even if you only use them wired. Keep the Mac awake and the page open. Expect roughly 10–20 minutes; browser speed may differ. Stop waits for the current command and prevents commit, but it doesn't undo staging writes. Never interrupt installation after commit. If the commit response is lost, the result is unknown: reconnect and verify before retrying.

After the headset finishes and restarts, connect again. The page reads the installed code fingerprint and shows stock or ANC-off. A commit acknowledgement alone isn't proof that installation finished.

## What's here

- `index.html`, `app.js`: UI, device picker, warning, progress, local log download.
- `core.js`: RACE framing, package validation, staging, integrity check, commit, and readback.
- `firmware.js`: embedded ANC-off package so opening from `file://` works without fetching a binary.
- `test.cjs`: protocol tests with a fake serial device. Run `node test.cjs`.

Only these package SHA-256 values are accepted:

```
ANC-off aad2b5073a1116536149680c341b8be2150d2b2d1c6c498dc2337fec0e1b3988
Stock   589e06b4fffbc74114f495ca0424761c0e3784b06adbf56d3f431559efe45b38
```

The native updater already worked on this unit. The browser implementation is experimental and has not completed a real hardware flash. Tests use a simulated device; they don't prove radio reliability. This is specific to the checked 2.9.0 flash layout, not a generic Sony updater.

Protocol research reference: [race-toolkit](https://github.com/auracast-research/race-toolkit). Browser transport: [Chrome's Bluetooth RFCOMM support](https://developer.chrome.com/blog/serial-over-bluetooth/). No analytics or network uploads.
