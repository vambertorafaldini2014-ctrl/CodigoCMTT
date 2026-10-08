import { api } from './api.js';
import { escaparHtml, formatarNumero, rotuloMandato } from './util.js';

const seletor = document.getElementById('seletor-mandato');
const status = document.getElementById('status');
let mandatos = [];

function erro(e) {
  status.textContent = e.message;
  status.className = 'status erro';
}

function nomes(lista) {
  return lista.length ? lista.map(p => escaparHtml(p.nome)).join('<br>') : '—';
}

async function mostrarMandato(id) {
  status.textContent = 'Carregando composição…';
  status.className = 'status';
  try {
    const m = await api.mandato(id);
    const resumo = mandatos.find(x => String(x.id) === String(id));
    document.getElementById('titulo-mandato').textContent = `Mandato ${rotuloMandato(m.codigo)}`;
    document.getElementById('resumo-mandato').innerHTML = `
      <li class="indicador"><span class="valor">${formatarNumero(resumo.cadeiras)}</span><span class="rotulo">cadeiras</span></li>
      <li class="indicador"><span class="valor">${formatarNumero(resumo.conselheiros)}</span><span class="rotulo">conselheiros (titulares e suplentes)</span></li>
      <li class="indicador"><span class="valor">${formatarNumero(resumo.reunioes)}</span><span class="rotulo">reuniões com ata</span></li>`;

    // Agrupa as cadeiras por segmento, uma tabela para cada
    const segmentos = {};
    for (const c of m.cadeiras) (segmentos[c.segmento] ??= []).push(c);
    document.getElementById('cadeiras').innerHTML = Object.entries(segmentos).map(([segmento, cadeiras]) => `
      <h3>${escaparHtml(segmento)} (${cadeiras.length})</h3>
      <div class="tabela-rolagem">
        <table>
          <caption class="visualmente-oculto">Cadeiras do segmento ${escaparHtml(segmento)}</caption>
          <thead><tr><th scope="col">Órgão / entidade</th><th scope="col">Titular</th><th scope="col">Suplente</th></tr></thead>
          <tbody>${cadeiras.map(c => `
            <tr><th scope="row" style="font-weight:normal">${escaparHtml(c.orgao)}</th>
                <td>${nomes(c.titulares)}</td><td>${nomes(c.suplentes)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>`).join('');
    status.textContent = '';
  } catch (e) { erro(e); }
}

document.getElementById('form-pessoa').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = document.getElementById('campo-pessoa').value.trim();
  if (q.length < 2) return;
  status.textContent = 'Procurando…';
  status.className = 'status';
  try {
    const dados = await api.conselheiros(q);
    const secao = document.getElementById('secao-pessoa');
    secao.hidden = false;
    document.getElementById('tabela-pessoa').innerHTML = dados.length ? `
      <table>
        <caption>${dados.length} participações encontradas para “${escaparHtml(q)}”</caption>
        <thead><tr><th scope="col">Nome</th><th scope="col">Mandato</th><th scope="col">Função</th><th scope="col">Órgão / entidade</th><th scope="col">Segmento</th></tr></thead>
        <tbody>${dados.map(p => `
          <tr><td>${escaparHtml(p.nome)}</td><td>${escaparHtml(rotuloMandato(p.mandato))}</td>
              <td>${p.funcao === 'TITULAR' ? 'Titular' : 'Suplente'}</td>
              <td>${escaparHtml(p.orgao)}</td><td>${escaparHtml(p.segmento)}</td></tr>`).join('')}
        </tbody>
      </table>` : `<p style="padding: 1rem">Nenhum conselheiro encontrado com “${escaparHtml(q)}”.</p>`;
    status.textContent = `${dados.length} participações encontradas.`;
    document.getElementById('titulo-pessoa').focus();
  } catch (e2) { erro(e2); }
});

seletor.addEventListener('change', () => mostrarMandato(seletor.value));

(async () => {
  try {
    mandatos = await api.mandatos();
    for (const m of mandatos) seletor.add(new Option(rotuloMandato(m.codigo), m.id));
    if (mandatos.length) mostrarMandato(mandatos[0].id);
  } catch (e) { erro(e); }
})();
