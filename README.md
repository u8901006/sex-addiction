# Sex Addiction / CSBD Research Daily Report

Automated daily literature report for sex addiction, compulsive sexual behavior disorder (CSBD), and related research topics.

## Features

- Daily automated PubMed search for CSBD-related literature
- AI-powered analysis using NVIDIA Nemotron (nvidia/nemotron-3-super-120b-a12b)
- Beautiful HTML reports deployed to GitHub Pages
- Incremental deduplication (only new papers are summarized)
- Topic classification and PICO analysis

## Live Site

[https://u8901006.github.io/sex-addiction/](https://u8901006.github.io/sex-addiction/)

## Setup

1. Set `NVIDIA_API_KEY` in repository secrets
2. Enable GitHub Pages (serve from `docs/` folder on `main` branch)
3. The workflow runs daily at 09:40 GMT+8

## Tech Stack

- Node.js 24
- PubMed E-Utilities API
- NVIDIA Nemotron (nvidia/nemotron-3-super-120b-a12b / nvidia/nemotron-3-nano-30b-a3b)
- GitHub Actions + GitHub Pages
