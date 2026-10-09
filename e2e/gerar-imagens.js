// Gera os ícones PNG do app (PWA) e a imagem de compartilhamento (Open Graph) usando o Chromium
// do Playwright. Rodar quando o ícone ou a identidade visual mudarem:  node gerar-imagens.js
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const IMG = '../web/img';
const svg = readFileSync(`${IMG}/favicon.svg`, 'utf-8');
const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const logoPref = `data:image/png;base64,${readFileSync(`${IMG}/logo_prefeitura.png`).toString('base64')}`;
const logoCmtt = `data:image/jpeg;base64,${readFileSync(`${IMG}/logo_cmtt.jpg`).toString('base64')}`;

const navegador = await chromium.launch();
const pagina = await navegador.newPage();

async function capturar(html, largura, altura, arquivo) {
  await pagina.setViewportSize({ width: largura, height: altura });
  await pagina.setContent(`<!doctype html><html><body style="margin:0">${html}</body></html>`);
  await pagina.screenshot({ path: `${IMG}/${arquivo}`, omitBackground: false });
  console.log('gerado', arquivo);
}

for (const tamanho of [192, 512]) {
  await capturar(`<img src="${svgDataUrl}" width="${tamanho}" height="${tamanho}" style="display:block">`, tamanho, tamanho, `icone-${tamanho}.png`);
}
// Ícone "maskable": o Android recorta em círculo/forma livre, então o desenho fica na área segura (80%)
await capturar(`<div style="width:512px;height:512px;background:#0b4f8a;display:grid;place-items:center">
  <img src="${svgDataUrl}" width="360" height="360"></div>`, 512, 512, 'icone-maskable-512.png');

await capturar(`
  <div style="width:1200px;height:630px;box-sizing:border-box;padding:70px 80px;background:linear-gradient(135deg,#0b4f8a,#083a66);
              color:#fff;font-family:Segoe UI,Roboto,Arial,sans-serif;display:flex;flex-direction:column;justify-content:space-between">
    <div style="display:flex;gap:28px;align-items:center;background:#fff;border-radius:18px;padding:18px 28px;width:max-content">
      <img src="${logoPref}" style="height:90px"><img src="${logoCmtt}" style="height:70px">
    </div>
    <div>
      <div style="font-size:76px;font-weight:800;line-height:1.05">Buscador CMTT</div>
      <div style="font-size:36px;margin-top:18px;opacity:.95">Atas, composição e indicadores do Conselho Municipal<br>de Trânsito e Transporte de São Paulo</div>
    </div>
    <div style="font-size:26px;opacity:.9">buscador-cmtt.netlify.app · Projeto Integrador UNIVESP</div>
  </div>`, 1200, 630, 'compartilhar.png');

await navegador.close();
