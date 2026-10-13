// Generates data/sample.csv — SYNTHETIC offline fallback with the same columns as the Google Sheet.
let s = 42; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const sms = [["RM1-Maria Santos","RM0001"],["RM2-Juan Dela Cruz","RM0002"],["RM3-Ana Reyes","RM0003"],
  ["BKH1-Edward Lumbab","BKH0001"],["BKH2-Rheya Senoy","BKH0002"],["BKH3-Paolo Tan","BKH0003"]];
const chs = ["SSA","SSB","WSR"];
const rows = [["SalesPerson","Position","Salesman Code","Customer Code","Customer Name","Channel","Period_Week","Projection","Actual"]];
let c = 0;
sms.forEach(([sp, code], i) => {
  for (let k = 0; k < 14; k++) {
    c++; const ch = chs[(i + k) % 3]; const cc = "CU" + String(100000 + c);
    const base = 20000 + rnd() * 400000; const skill = 0.6 + rnd() * 0.7 + (i % 3 === 0 ? 0.1 : 0);
    for (let w = 1; w <= 6; w++) {
      const p = Math.round(base * (0.8 + rnd() * 0.4)) / 1;
      const a = w === 6 ? 0 : Math.round(p * skill * (0.5 + rnd()) * (rnd() < 0.1 ? 0 : 1));
      rows.push([sp, sp.startsWith("RM") ? "BTDT Seller" : "Key Account Seller", code, cc, `SAMPLE CUSTOMER ${c}`, ch, "Week " + (w + 36), p, a]);
    }
  }
});
console.log(rows.map(r => r.map(v => /[",]/.test(v) ? `"${v}"` : v).join(",")).join("\n"));
