#!/usr/bin/env node

import { readdirSync, writeFileSync } from 'node:fs';

const WEEKDAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

function fmtDate(filename) {
  const m = filename.match(/sex-addiction-(\d{4})-(\d{2})-(\d{2})\.html/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  const wd = WEEKDAYS[d.getDay()];
  return { y: +m[1], mo: +m[2], dd: +m[3], wd, sort: m[0] };
}

function renderIndex(files) {
  const items = files.map(f => {
    const d = fmtDate(f);
    if (!d) return '';
    return `    <li><a href="${f}">\uD83D\uDCC5 ${d.y}\u5E74${d.mo}\u6708${d.dd}\u65E5\uFF08${d.wd}\uFF09</a></li>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Sex Addiction Research \xB7 \u6027\u6210\u764E\u7814\u7A76\u6587\u737B\u65E5\u5831</title>
<style>
:root{--bg:#f6f1e8;--surface:#fffaf2;--line:#d8c5ab;--text:#2b2118;--muted:#766453;--accent:#8c4f2b;--accent-soft:#ead2bf}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:radial-gradient(circle at top,#fff6ea 0,var(--bg) 55%,#ead8c6 100%);color:var(--text);font-family:"Noto Sans TC","PingFang TC","Helvetica Neue",Arial,sans-serif;min-height:100vh}
.container{position:relative;z-index:1;max-width:640px;margin:0 auto;padding:80px 24px}
.logo{font-size:48px;text-align:center;margin-bottom:16px}
h1{text-align:center;font-size:24px;color:var(--text);margin-bottom:8px}
.subtitle{text-align:center;color:var(--accent);font-size:14px;margin-bottom:48px}
.count{text-align:center;color:var(--muted);font-size:13px;margin-bottom:32px}
ul{list-style:none}
li{margin-bottom:8px}
a{color:var(--text);text-decoration:none;display:block;padding:14px 20px;background:var(--surface);border:1px solid var(--line);border-radius:12px;transition:all .2s;font-size:15px}
a:hover{background:var(--accent-soft);border-color:var(--accent);transform:translateX(4px)}
footer{margin-top:56px;text-align:center;font-size:12px;color:var(--muted)}
footer a{display:inline;padding:0;background:none;border:none;color:var(--muted)}
footer a:hover{color:var(--accent)}
.clinic-banner{margin-top:40px;padding:20px;background:var(--surface);border:1px solid var(--line);border-radius:12px;text-align:center;font-size:14px;line-height:2}
.clinic-banner a{display:inline;padding:0;background:none;border:none;color:var(--accent);font-weight:600}
.clinic-banner a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="container">
  <div class="logo">\uD83D\uDD2C</div>
  <h1>Sex Addiction Research</h1>
  <p class="subtitle">\u6027\u6210\u764E\u7814\u7A76\u6587\u737B\u65E5\u5831 \xB7 \u6BCF\u65E5\u81EA\u52D5\u66F4\u65B0</p>
  <p class="count">\u5171 ${files.length} \u671F\u65E5\u5831</p>
  <ul>
${items}
  </ul>
  <div class="clinic-banner">
    <p>\uD83C\uDFE0 <a href="https://www.leepsyclinic.com/">\u674E\u653F\u6D0B\u8EAB\u5FC3\u8A3A\u6240\u9996\u9801</a></p>
    <p>\uD83D\uDCE8 <a href="https://blog.leepsyclinic.com/">\u8A02\u95B1\u96FB\u5B50\u5831</a></p>
    <p>\u2615 <a href="https://buymeacoffee.com/CYlee">Buy me a coffee</a></p>
  </div>
  <footer>
    <p>Powered by PubMed + Zhipu AI \xB7 <a href="https://github.com/u8901006/sex-addiction">GitHub</a></p>
  </footer>
</div>
</body>
</html>`;
}

const files = readdirSync('docs')
  .filter(f => /^sex-addiction-\d{4}-\d{2}-\d{2}\.html$/.test(f))
  .sort()
  .reverse();

writeFileSync('docs/index.html', renderIndex(files));
console.log(`[INFO] Index generated with ${files.length} reports`);
