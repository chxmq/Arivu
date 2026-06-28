// Drives the kaavu_collect firmware: selects a class and auto-records for N seconds.
// Usage: CLS=<1-4> SECS=<seconds> node collect.js
const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const CLS = String(process.env.CLS || "1");
const SECS = Number(process.env.SECS || 80);
const port = new SerialPort({ path: "/dev/cu.usbserial-0001", baudRate: 115200 });
const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));
let saved = 0, lastAmp = "-";
port.on("error", (e) => console.log("ERR", e.message));
parser.on("data", (l) => {
  const s = String(l).replace(/\r$/, "");
  const m = s.match(/saved .*amp=(\d+).*#(\d+)/);
  if (m) { saved++; lastAmp = m[1]; if (saved % 5 === 0) console.log(`  ${saved} clips (amp ~${m[1]})`); }
  if (/FATAL|FAILED/.test(s)) console.log("  " + s);
});
port.on("open", () => {
  setTimeout(() => port.write(CLS), 600);     // select class
  setTimeout(() => port.write("a"), 1200);    // auto record ON
  setTimeout(() => { port.write("a"); }, 1200 + SECS * 1000);  // auto OFF
  setTimeout(() => { console.log(`DONE class ${CLS}: ${saved} clips saved (last amp ~${lastAmp})`); process.exit(0); }, 1200 + SECS * 1000 + 2500);
});
