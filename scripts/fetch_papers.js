#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';

const ESEARCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
const EFETCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';
const HEADERS = { 'User-Agent': 'SexAddictionResearchBot/1.0 (research-aggregator)' };

const SEARCH_TERMS = [
  '"compulsive sexual behavior disorder"[Title/Abstract]',
  '"compulsive sexual behaviour disorder"[Title/Abstract]',
  'CSBD[Title/Abstract]',
  '"compulsive sexual behavior"[Title/Abstract]',
  '"compulsive sexual behaviour"[Title/Abstract]',
  '"sexual addiction"[Title/Abstract]',
  '"sex addiction"[Title/Abstract]',
  'hypersexual*[Title/Abstract]',
  '"problematic pornography use"[Title/Abstract]',
  '"pornography use disorder"[Title/Abstract]',
  '"out-of-control sexual behavior"[Title/Abstract]',
  '"sexual compulsivity"[Title/Abstract]',
  '"sexual impulsivity"[Title/Abstract]',
  '"cybersex addiction"[Title/Abstract]',
  '"online sexual activities"[Title/Abstract]',
];

function buildQuery(days) {
  const terms = SEARCH_TERMS.join(' OR ');
  const d = new Date();
  d.setDate(d.getDate() - days);
  const since = d.toISOString().slice(0, 10).replace(/-/g, '/');
  return `(${terms}) AND "${since}"[Date - Publication] : "3000"[Date - Publication]`;
}

async function searchPapers(query, retmax) {
  const params = new URLSearchParams({
    db: 'pubmed', term: query,
    retmax: String(retmax), sort: 'date', retmode: 'json',
  });
  const resp = await fetch(`${ESEARCH_URL}?${params}`, {
    headers: HEADERS, signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`PubMed search: ${resp.status}`);
  const data = await resp.json();
  return data?.esearchresult?.idlist || [];
}

async function fetchDetails(pmids) {
  if (!pmids.length) return [];
  const params = new URLSearchParams({
    db: 'pubmed', id: pmids.join(','), retmode: 'xml',
  });
  const resp = await fetch(`${EFETCH_URL}?${params}`, {
    headers: HEADERS, signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) throw new Error(`PubMed fetch: ${resp.status}`);
  return parseXml(await resp.text());
}

function parseXml(xml) {
  const papers = [];
  const blocks = xml.split(/<PubmedArticle>/).slice(1);
  for (const raw of blocks) {
    const end = raw.indexOf('</PubmedArticle>');
    const block = end > 0 ? raw.slice(0, end) : raw;
    try {
      const pmid = firstTag(block, 'PMID');
      const title = firstTag(block, 'ArticleTitle');
      if (!pmid || !title) continue;
      papers.push({
        pmid: clean(pmid),
        title: clean(title),
        abstract: clean(extractAbstract(block)).slice(0, 2000),
        journal: extractJournal(block),
        date: extractDate(block),
        url: `https://pubmed.ncbi.nlm.nih.gov/${clean(pmid)}/`,
        keywords: extractKeywords(block),
      });
    } catch {}
  }
  return papers;
}

function firstTag(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1] : '';
}

function extractAbstract(xml) {
  const parts = [];
  const re = /<AbstractText(?:\s+Label="([^"]*)")?\s*>([\s\S]*?)<\/AbstractText>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const label = m[1] ? m[1] + ': ' : '';
    parts.push(label + m[2].replace(/<[^>]+>/g, '').trim());
  }
  return parts.join(' ');
}

function extractJournal(xml) {
  let m = xml.match(/<Title>([\s\S]*?)<\/Title>/);
  if (m && m[1].trim()) return m[1].trim();
  m = xml.match(/<ISOAbbreviation>([\s\S]*?)<\/ISOAbbreviation>/);
  return m ? m[1].trim() : 'Unknown';
}

function extractDate(xml) {
  const ym = xml.match(/<PubDate>[\s\S]*?<Year>(\d+)<\/Year>[\s\S]*?<Month>(\w+)<\/Month>/);
  if (ym) return `${ym[1]} ${ym[2]}`;
  const y = xml.match(/<PubDate>[\s\S]*?<Year>(\d+)<\/Year>/);
  if (y) return y[1];
  const md = xml.match(/<MedlineDate>([^<]+)<\/MedlineDate>/);
  return md ? md[1].trim() : '';
}

function extractKeywords(xml) {
  const kws = [];
  const re = /<Keyword>([^<]+)<\/Keyword>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) kws.push(m[1].trim());
  return kws.slice(0, 10);
}

function clean(s) {
  return s ? s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
}

function loadProcessedPmids() {
  try {
    if (existsSync('docs/processed_pmids.json')) {
      return new Set(JSON.parse(readFileSync('docs/processed_pmids.json', 'utf8')).pmids || []);
    }
  } catch {}
  return new Set();
}

async function main() {
  const { values } = parseArgs({
    options: {
      days: { type: 'string', default: '7' },
      'max-papers': { type: 'string', default: '40' },
      output: { type: 'string', default: 'papers.json' },
    },
  });

  const days = Math.max(1, parseInt(values.days) || 7);
  const maxPapers = Math.min(100, Math.max(1, parseInt(values['max-papers']) || 40));

  console.log(`[INFO] Searching PubMed (last ${days} days, max ${maxPapers})...`);
  const query = buildQuery(days);
  const pmids = await searchPapers(query, maxPapers);
  console.log(`[INFO] Found ${pmids.length} PMIDs`);

  const processed = loadProcessedPmids();
  const newPmids = pmids.filter(id => !processed.has(id));
  console.log(`[INFO] ${newPmids.length} new (dedup from ${processed.size} processed)`);

  if (!newPmids.length) {
    console.log('[INFO] No new papers');
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
    writeFileSync(values.output, JSON.stringify({ date: today, count: 0, papers: [] }, null, 2));
    return;
  }

  const papers = await fetchDetails(newPmids);
  console.log(`[INFO] Fetched ${papers.length} papers`);

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
  writeFileSync(values.output, JSON.stringify({ date: today, count: papers.length, papers }, null, 2));
  console.log(`[INFO] Saved to ${values.output}`);
}

main().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
