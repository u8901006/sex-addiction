#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';

const API_BASE = 'https://open.bigmodel.cn/api/coding/paas/v4';
const MODELS = ['GLM-5-Turbo', 'GLM-4.7', 'GLM-4.7-Flash'];
const MAX_TOKENS = 50000;
const TIMEOUT_MS = 480000;
const MAX_RETRIES = 3;

const ALLOWED_TAGS = [
  'CSBD\u8A3A\u65B7\u5206\u985E', 'PPU\u8272\u60C5\u5167\u5BB9', '\u795E\u7D93\u5F71\u50CF',
  '\u885D\u52D5\u5F37\u8FEB\u6A5F\u5236', '\u85E5\u7269\u6CBB\u7642', '\u5FC3\u7406\u6CBB\u7642',
  '\u5275\u50B7\u4F9D\u9644', '\u7F9E\u6155\u7F6A\u60E1\u611F', '\u7CBE\u795E\u5171\u75C5',
  '\u6D41\u884C\u75C5\u5B78', '\u91CF\u8868\u8A55\u4F30', '\u6578\u4F4D\u6027\u70BA',
  '\u6027\u5225\u6587\u5316', 'HIV/STI\u98A8\u96AA', '\u793E\u6703\u6587\u5316\u6279\u5224',
  '\u9752\u5C11\u5E74', '\u795E\u7D93\u751F\u7269\u5B78', '\u4F34\u4FB6\u95DC\u4FC2',
  '\u7269\u8CEA\u4F7F\u7528', '\u9053\u5FB7\u4E0D\u4E00\u81F4', '\u5E15\u91D1\u68EE\u75C7',
  '\u9451\u5225\u8A3A\u65B7',
];

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function extractJSON(text) {
  try { return JSON.parse(text); } catch {}
  const cb = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (cb) {
    try { return JSON.parse(cb[1].trim()); } catch {}
  }
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s !== -1 && e > s) {
    let j = text.slice(s, e + 1);
    j = j.replace(/,\s*([}\]])/g, '$1');
    j = j.replace(/'/g, '"');
    try { return JSON.parse(j); } catch {}
  }
  return null;
}

async function callAI(apiKey, model, systemPrompt, userPrompt) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const resp = await fetch(`${API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          top_p: 0.9,
          max_tokens: MAX_TOKENS,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (resp.status === 429) {
        const wait = Math.min(2000 * attempt, 10000);
        console.log(`[WARN] Rate limited on ${model}, retry ${attempt}/${MAX_RETRIES} in ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(`${model} API ${resp.status}: ${body.slice(0, 200)}`);
      }
      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error(`${model} returned empty content`);
      return content;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error(`${model} timed out after ${TIMEOUT_MS}ms`);
      if (attempt === MAX_RETRIES) throw err;
      console.log(`[WARN] ${model} attempt ${attempt} failed: ${err.message}`);
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

async function analyzeWithAI(apiKey, papersData) {
  const systemPrompt = `\u4F60\u662F\u4E00\u4F4D\u8CC7\u6DF1\u7684\u7CBE\u795E\u79D1\u8207\u6027\u6210\u764E\u7814\u7A76\u5B78\u8005\uFF0C\u540C\u6642\u4E5F\u662F\u79D1\u5B78\u50B3\u64AD\u5C08\u5BB6\u3002\u4F60\u7684\u4EFB\u52D9\u662F\u5206\u6790\u6700\u65B0\u7684\u5B78\u8853\u6587\u737B\uFF0C\u70BA\u81E8\u5E8A\u91AB\u5E2B\u548C\u7814\u7A76\u4EBA\u54E1\u63D0\u4F9B\u6BCF\u65E5\u6587\u737B\u6458\u8981\u3002

\u8ACB\u56B4\u683C\u4EE5 JSON \u683C\u5F0F\u56DE\u61C9\uFF0C\u4E0D\u8981\u5305\u542B\u4EFB\u4F55\u5176\u4ED6\u6587\u5B57\u6216\u8A3B\u89E3\u3002

JSON \u7D50\u69CB\u5982\u4E0B\uFF1A
{
  "summary": "\u4ECA\u65E5\u6587\u737B\u8DA8\u52E2\u7684\u4E00\u6BB5\u4E2D\u6587\u6458\u8981\uFF08100-200\u5B57\uFF09",
  "top_picks": [
    {
      "rank": 1,
      "title": "\u539F\u6587\u6A19\u984C",
      "journal": "\u671F\u520A\u540D",
      "pmid": "PMID",
      "pico": {
        "population": "\u7814\u7A76\u5C0D\u8C61\uFF0830\u5B57\u5167\uFF09",
        "intervention": "\u4ECB\u5165/\u66B4\u9732\uFF0830\u5B57\u5167\uFF09",
        "comparison": "\u5C0D\u7167\uFF0830\u5B57\u5167\uFF09",
        "outcome": "\u7D50\u679C\uFF0830\u5B57\u5167\uFF09"
      },
      "clinical_utility": "\u9AD8/\u4E2D/\u4F4E",
      "summary_zh": "\u4E2D\u6587\u6458\u8981\uFF08100-150\u5B57\uFF09",
      "tags": ["\u6A19\u7C64\u4E00", "\u6A19\u7C64\u4E8C"]
    }
  ],
  "other_papers": [
    {
      "title": "\u539F\u6587\u6A19\u984C",
      "journal": "\u671F\u520A\u540D",
      "pmid": "PMID",
      "summary_zh": "\u7C21\u77ED\u4E2D\u6587\u6458\u8981\uFF0850-80\u5B57\uFF09",
      "tags": ["\u6A19\u7C64"]
    }
  ],
  "topic_distribution": {
    "\u4E3B\u984C\u540D\u7A31": \u6578\u91CF
  },
  "keywords": ["\u95DC\u9375\u5B57\u4E00", "\u95DC\u9375\u5B57\u4E8C"]
}

\u6A19\u7C64\u8A5E\u5F59\u8868\uFF08\u53EA\u80FD\u4F7F\u7528\u4EE5\u4E0B\u6A19\u7C64\uFF09\uFF1A
${ALLOWED_TAGS.join(', ')}

\u898F\u5247\uFF1A
1. \u5F9E\u6240\u6709\u6587\u737B\u4E2D\u6311\u9078 5-8 \u7BC7\u6700\u91CD\u8981\u7684\u4F5C\u70BA top_picks
2. clinical_utility \u53EA\u80FD\u662F\u300C\u9AD8\u300D\u300C\u4E2D\u300D\u300C\u4F4E\u300D
3. PICO \u5206\u6790\u8ACB\u7CBE\u7C21\uFF0C\u6BCF\u9805\u4E0D\u8D85\u904E 30 \u5B57
4. \u4E2D\u6587\u6458\u8981\u8ACB\u7528\u53F0\u7063\u7E41\u9AD4\u4E2D\u6587
5. \u5176\u9918\u6587\u737B\u653E\u5165 other_papers\uFF0C\u6BCF\u7BC7 50-80 \u5B57\u6458\u8981
6. topic_distribution \u7D71\u8A08\u5404\u4E3B\u984C\u7684\u6587\u737B\u6578\u91CF
7. keywords \u5217\u51FA 10-20 \u500B\u91CD\u8981\u95DC\u9375\u5B57`;

  const paperList = papersData.papers.map((p, i) =>
    `${i + 1}. PMID: ${p.pmid}\n   \u6A19\u984C: ${p.title}\n   \u671F\u520A: ${p.journal}\n   \u65E5\u671F: ${p.date}\n   \u6458\u8981: ${p.abstract}\n   \u95DC\u9375\u5B57: ${(p.keywords || []).join(', ')}`
  ).join('\n\n');

  const userPrompt = `\u4EE5\u4E0B\u662F\u4ECA\u65E5\u5F9E PubMed \u53D6\u5F97\u7684 ${papersData.count} \u7BC7\u6027\u6210\u764E/\u5F37\u8FEB\u6027\u884C\u70BA\u969C\u7919\u76F8\u95DC\u7814\u7A76\u6587\u737B\uFF1A

${paperList}

\u8ACB\u5206\u6790\u4EE5\u4E0A\u6587\u737B\uFF0C\u4F9D\u6307\u5B9A JSON \u683C\u5F0F\u56DE\u61C9\u3002`;

  let lastErr;
  for (const model of MODELS) {
    try {
      console.log(`[INFO] Trying ${model}...`);
      const raw = await callAI(apiKey, model, systemPrompt, userPrompt);
      const parsed = extractJSON(raw);
      if (parsed && (parsed.top_picks || parsed.other_papers)) {
        console.log(`[INFO] ${model} succeeded`);
        return parsed;
      }
      console.log(`[WARN] ${model} returned unparseable JSON, trying next model`);
    } catch (err) {
      lastErr = err;
      console.log(`[WARN] ${model} failed: ${err.message}`);
    }
  }
  if (papersData.papers.length === 0) return null;
  console.log('[WARN] All models failed, generating fallback');
  return buildFallback(papersData.papers);
}

function buildFallback(papers) {
  return {
    summary: `\u4ECA\u65E5\u5171\u6709 ${papers.length} \u7BC7\u6027\u6210\u764E\u76F8\u95DC\u6587\u737B\uFF0C\u4EE5\u4E0B\u70BA\u81EA\u52D5\u6574\u7406\u7684\u6587\u737B\u6E05\u55AE\uFF08AI \u5206\u6790\u66AB\u6642\u7121\u6CD5\u4F7F\u7528\uFF09\u3002`,
    top_picks: papers.slice(0, 5).map((p, i) => ({
      rank: i + 1, title: p.title, journal: p.journal, pmid: p.pmid,
      pico: { population: '-', intervention: '-', comparison: '-', outcome: '-' },
      clinical_utility: '\u4E2D', summary_zh: '\uFF08\u5F85\u5206\u6790\uFF09', tags: [],
    })),
    other_papers: papers.slice(5).map(p => ({
      title: p.title, journal: p.journal, pmid: p.pmid,
      summary_zh: '\uFF08\u5F85\u5206\u6790\uFF09', tags: [],
    })),
    topic_distribution: {}, keywords: [],
  };
}

function generateHTML(analysis, date, papersData) {
  const total = (analysis.top_picks?.length || 0) + (analysis.other_papers?.length || 0);
  const WEEKDAYS = ['\u9031\u65E5', '\u9031\u4E00', '\u9031\u4E8C', '\u9031\u4E09', '\u9031\u56DB', '\u9031\u4E94', '\u9031\u516D'];
  const d = new Date(date);
  const dateDisplay = `${d.getFullYear()}\u5E74${d.getMonth() + 1}\u6708${d.getDate()}\u65E5\uFF08${WEEKDAYS[d.getDay()]}\uFF09`;

  const utilityColor = u => u === '\u9AD8' ? '#5a7a3a' : u === '\u4E2D' ? '#9f7a2e' : 'var(--muted)';
  const utilityBg = u => u === '\u9AD8' ? '#eaf2e2' : u === '\u4E2D' ? '#f5ecd0' : 'var(--accent-soft)';

  const maxTopic = Math.max(1, ...Object.values(analysis.topic_distribution || {}));

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>\u6027\u6210\u764E\u7814\u7A76\u6587\u737B\u65E5\u5831 \xB7 ${date}</title>
<style>
:root{--bg:#f6f1e8;--surface:#fffaf2;--line:#d8c5ab;--text:#2b2118;--muted:#766453;--accent:#8c4f2b;--accent-soft:#ead2bf;--card-bg:color-mix(in srgb,var(--surface) 92%,white)}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:radial-gradient(circle at top,#fff6ea 0,var(--bg) 55%,#ead8c6 100%);color:var(--text);font-family:"Noto Sans TC","PingFang TC","Helvetica Neue",Arial,sans-serif;min-height:100vh;line-height:1.7}
.wrap{max-width:880px;margin:0 auto;padding:32px 20px 64px}
.header{text-align:center;padding:48px 0 32px;animation:fadeDown .6s ease}
.logo{font-size:56px;margin-bottom:12px}
h1{font-size:28px;font-weight:700;margin-bottom:4px}
.subtitle{color:var(--accent);font-size:14px;margin-bottom:20px;font-weight:500}
.badges{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.badge{display:inline-block;padding:5px 14px;border-radius:20px;font-size:13px;font-weight:600}
.badge.date-badge{background:var(--accent-soft);color:var(--accent)}
.badge.count-badge{background:#e2ddd4;color:var(--muted)}
.card{background:var(--card-bg);border:1px solid var(--line);border-radius:24px;padding:28px;margin-bottom:20px;animation:fadeUp .6s ease both}
.card h2{font-size:20px;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.summary-text{font-size:15px;line-height:1.9;color:var(--text)}
.section-title{font-size:22px;font-weight:700;margin:36px 0 20px;padding-left:4px;display:flex;align-items:center;gap:10px}
.pick-card{background:var(--card-bg);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:16px;padding:24px;margin-bottom:18px;animation:fadeUp .5s ease both}
.pick-header{display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.rank{width:32px;height:32px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0}
.pick-title{font-size:17px;font-weight:600;flex:1;min-width:0}
.pick-journal{font-size:13px;color:var(--muted)}
.util-badge{padding:3px 10px;border-radius:12px;font-size:12px;font-weight:700;color:#fff}
.pico-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin:14px 0}
.pico-item{font-size:13px;line-height:1.5}
.pico-label{color:var(--accent);font-weight:700;margin-right:4px}
.pick-summary{font-size:14px;line-height:1.8;margin:12px 0;color:var(--text)}
.pick-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.tag{padding:3px 10px;border-radius:10px;font-size:11px;background:var(--accent-soft);color:var(--accent);font-weight:500}
.paper-card{background:var(--card-bg);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:12px;animation:fadeUp .5s ease both}
.paper-title{font-size:15px;font-weight:600;margin-bottom:4px}
.paper-meta{font-size:12px;color:var(--muted);margin-bottom:8px}
.paper-summary{font-size:13px;line-height:1.7;color:var(--text)}
.topic-row{display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:14px}
.topic-label{width:120px;text-align:right;flex-shrink:0;color:var(--text);font-weight:500}
.topic-bar-wrap{flex:1;height:22px;background:var(--accent-soft);border-radius:6px;overflow:hidden}
.topic-bar{height:100%;background:var(--accent);border-radius:6px;transition:width .5s ease;min-width:2px}
.topic-count{font-size:12px;color:var(--muted);width:28px;text-align:right;flex-shrink:0}
.kw-wrap{display:flex;flex-wrap:wrap;gap:8px}
.kw{padding:5px 14px;background:var(--accent-soft);color:var(--accent);border-radius:14px;font-size:13px;font-weight:500}
.clinic-banner{margin-top:40px;padding:24px;background:var(--surface);border:1px solid var(--line);border-radius:16px;text-align:center;font-size:14px;line-height:2.2}
.clinic-banner a{color:var(--accent);text-decoration:none;font-weight:600}
.clinic-banner a:hover{text-decoration:underline}
footer{text-align:center;font-size:12px;color:var(--muted);margin-top:40px;line-height:1.8}
footer a{color:var(--muted);text-decoration:none}
footer a:hover{color:var(--accent)}
.empty{text-align:center;padding:60px 20px;color:var(--muted);font-size:15px}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeDown{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:600px){
  .wrap{padding:16px 12px 40px}
  .pico-grid{grid-template-columns:1fr}
  .topic-label{width:80px;font-size:12px}
  .pick-card,.card{padding:18px;border-radius:16px}
}
</style>
</head>
<body>
<div class="wrap">
${renderHeader(dateDisplay, total)}
${analysis ? renderContent(analysis, papersData) : renderEmpty(date)}
${renderClinic()}
${renderFooter(date)}
</div>
</body>
</html>`;

  function renderHeader(dateDisplay, count) {
    return `<header class="header">
  <div class="logo">\uD83D\uDD2C</div>
  <h1>Sex Addiction Research</h1>
  <p class="subtitle">\u6027\u6210\u764E\u7814\u7A76\u6587\u737B\u65E5\u5831</p>
  <div class="badges">
    <span class="badge date-badge">\uD83D\uDCC5 ${esc(dateDisplay)}</span>
    <span class="badge count-badge">\uD83D\uDCC4 ${count} \u7BC7\u6587\u737B</span>
  </div>
</header>`;
  }

  function renderContent(a, pd) {
    let html = '';
    if (a.summary) {
      html += `<section class="card"><h2>\uD83D\uDCCA \u4ECA\u65E5\u6587\u737B\u8DA8\u52E2</h2><p class="summary-text">${esc(a.summary)}</p></section>`;
    }
    if (a.top_picks?.length) {
      html += `<h2 class="section-title">\u2B50 \u672C\u65E5\u7CBE\u9078</h2>`;
      html += a.top_picks.map((p, i) => {
        const delay = i * 0.08;
        return `<div class="pick-card" style="animation-delay:${delay}s">
  <div class="pick-header">
    <span class="rank">${p.rank || i + 1}</span>
    <span class="pick-title">${esc(p.title)}</span>
  </div>
  <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
    <span class="pick-journal">${esc(p.journal)}</span>
    <a href="https://pubmed.ncbi.nlm.nih.gov/${esc(p.pmid)}/" target="_blank" style="font-size:12px;color:var(--accent)">PubMed \u2197</a>
    <span class="util-badge" style="background:${utilityColor(p.clinical_utility)}">\u81E8\u5E8A\u50F9\u503C\uFF1A${esc(p.clinical_utility)}</span>
  </div>
  ${p.pico ? `<div class="pico-grid">
    <div class="pico-item"><span class="pico-label">P</span>${esc(p.pico.population || '-')}</div>
    <div class="pico-item"><span class="pico-label">I</span>${esc(p.pico.intervention || '-')}</div>
    <div class="pico-item"><span class="pico-label">C</span>${esc(p.pico.comparison || '-')}</div>
    <div class="pico-item"><span class="pico-label">O</span>${esc(p.pico.outcome || '-')}</div>
  </div>` : ''}
  <p class="pick-summary">${esc(p.summary_zh)}</p>
  ${p.tags?.length ? `<div class="pick-tags">${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
</div>`;
      }).join('');
    }
    if (a.other_papers?.length) {
      html += `<h2 class="section-title">\uD83D\uDCCB \u5176\u4ED6\u6587\u737B</h2>`;
      html += a.other_papers.map(p => `<div class="paper-card">
  <div class="paper-title">${esc(p.title)}</div>
  <div class="paper-meta">${esc(p.journal)} \xB7 <a href="https://pubmed.ncbi.nlm.nih.gov/${esc(p.pmid)}/" target="_blank" style="color:var(--accent)">PMID: ${esc(p.pmid)}</a></div>
  <div class="paper-summary">${esc(p.summary_zh)}</div>
  ${p.tags?.length ? `<div class="pick-tags" style="margin-top:6px">${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
</div>`).join('');
    }
    const topics = Object.entries(a.topic_distribution || {});
    if (topics.length) {
      html += `<section class="card"><h2>\uD83D\uDCC8 \u4E3B\u984C\u5206\u4F48</h2>`;
      html += topics.sort((a, b) => b[1] - a[1]).map(([label, count]) => {
        const pct = Math.round((count / maxTopic) * 100);
        return `<div class="topic-row">
  <span class="topic-label">${esc(label)}</span>
  <div class="topic-bar-wrap"><div class="topic-bar" style="width:${pct}%"></div></div>
  <span class="topic-count">${count}</span>
</div>`;
      }).join('');
      html += `</section>`;
    }
    if (a.keywords?.length) {
      html += `<section class="card"><h2>\uD83C\uDFF7\uFE0F \u95DC\u9375\u5B57</h2><div class="kw-wrap">${a.keywords.map(k => `<span class="kw">${esc(k)}</span>`).join('')}</div></section>`;
    }
    return html;
  }

  function renderEmpty(date) {
    return `<section class="card empty">
  <p style="font-size:48px;margin-bottom:16px">\uD83D\uDCDD</p>
  <p>\u4ECA\u65E5\u7121\u65B0\u6587\u737B</p>
  <p style="font-size:13px;margin-top:8px">\u904E\u53BB 7 \u5929\u5167\u6C92\u6709\u672A\u6458\u8981\u7684\u6027\u6210\u764E\u76F8\u95DC\u7814\u7A76\u6587\u737B</p>
</section>`;
  }

  function renderClinic() {
    return `<div class="clinic-banner">
  <p>\uD83C\uDFE0 <a href="https://www.leepsyclinic.com/">\u674E\u653F\u6D0B\u8EAB\u5FC3\u8A3A\u6240\u9996\u9801</a></p>
  <p>\uD83D\uDCE8 <a href="https://blog.leepsyclinic.com/">\u8A02\u95B1\u96FB\u5B50\u5831</a></p>
  <p>\u2615 <a href="https://buymeacoffee.com/CYlee">Buy me a coffee</a></p>
</div>`;
  }

  function renderFooter(date) {
    return `<footer>
  <p>Powered by PubMed + Zhipu AI \xB7 <a href="https://github.com/u8901006/sex-addiction">GitHub</a></p>
  <p style="margin-top:4px">\u6578\u64DA\u4F86\u6E90\uFF1APubMed E-Utilities \xB7 AI \u5206\u6790\uFF1AGLM-5-Turbo</p>
</footer>`;
  }
}

function saveProcessedPmids(newPmids) {
  const path = 'docs/processed_pmids.json';
  let existing = { pmids: [] };
  try {
    if (existsSync(path)) existing = JSON.parse(readFileSync(path, 'utf8'));
  } catch {}
  const set = new Set([...(existing.pmids || []), ...newPmids]);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const data = { lastUpdated: new Date().toISOString(), pmids: [...set].slice(-500) };
  writeFileSync(path, JSON.stringify(data, null, 2));
}

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: 'string', default: 'papers.json' },
      output: { type: 'string' },
      date: { type: 'string' },
    },
  });

  if (!values.output) {
    console.error('[FATAL] --output is required');
    process.exit(1);
  }
  const date = values.date || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    console.error('[FATAL] ZHIPU_API_KEY env var not set');
    process.exit(1);
  }

  let papersData;
  try {
    papersData = JSON.parse(readFileSync(values.input, 'utf8'));
  } catch {
    console.error('[FATAL] Cannot read papers input');
    process.exit(1);
  }

  console.log(`[INFO] Processing ${papersData.count} papers for ${date}`);

  const analysis = papersData.count > 0 ? await analyzeWithAI(apiKey, papersData) : null;

  const html = generateHTML(analysis, date, papersData);
  writeFileSync(values.output, html, 'utf8');
  console.log(`[INFO] Report saved to ${values.output}`);

  if (papersData.papers?.length) {
    saveProcessedPmids(papersData.papers.map(p => p.pmid));
    console.log(`[INFO] Updated processed PMIDs (+${papersData.papers.length})`);
  }
}

main().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
