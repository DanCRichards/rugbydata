const fs = require("fs");
const sp = process.argv[2];
let html = fs.readFileSync(sp + "/ruckmetrics.html", "utf8");
let data = fs.readFileSync(sp + "/ruckmetrics-data.json", "utf8");
// Escape characters that could break the <script> context or JS string parsing.
// All are valid when written as \uXXXX escapes inside JSON. Built from char codes
// so the source file itself contains no line-separator literals.
const map = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  " ": "\\u2028",
  " ": "\\u2029",
};
const re = new RegExp("[\\u003c\\u003e\\u0026\\u2028\\u2029]", "g");
data = data.replace(re, (c) => map[c]);
if (html.indexOf("__DATA__") < 0) {
  console.error("placeholder missing");
  process.exit(1);
}
html = html.replace("__DATA__", () => data);
fs.writeFileSync(sp + "/ruckmetrics.html", html);
console.log("inlined; final size:", (html.length / 1024).toFixed(0) + "KB");
