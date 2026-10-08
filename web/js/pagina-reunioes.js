import { api } from './api.js';
import { escaparHtml, formatarData } from './util.js';

const filtroAno = document.getElementById('filtro-ano');
const filtroTipo = document.getElementById('filtro-tipo');
const corpo = document.getElementById('corpo-tabela');
const legenda = document.getElementById('legenda-tabela');
const status = document.getElementById('status');

async function carregar() {
  status.textContent = 'Carregando reuniões…';
  status.className = 'status';
  try {
    const reunioes = await api.reunioes({ ano: filtroAno.value, tipo: filtroTipo.value });
    corpo.innerHTML = reunioes.map(r => `
      <tr>
        <td>${formatarData(r.data)}</td>
        <td><a href="reuniao.html?id=${r.id}">${escaparHtml(r.titulo)}</a>
          ${r.tipo !== 'Ordinária' ? `<br><small>${escaparHtml(r.tipo)}</small>` : ''}</td>
        <td>${escaparHtml(r.local || 'Não informado')}</td>
        <td>${escaparHtml(r.tema_principal || '—')}</td>
        <td><a href="${escaparHtml(r.url_pdf)}" target="_blank" rel="noopener">PDF<span class="visualmente-oculto"> da ${escaparHtml(r.titulo)} (abre em nova aba)</span></a></td>
      </tr>`).join('');
    legenda.textContent = `${reunioes.length} reuniões encontradas`;
    status.textContent = `${reunioes.length} reuniões listadas.`;
  } catch (erro) {
    status.textContent = erro.message;
    status.className = 'status erro';
  }
}

filtroAno.addEventListener('change', carregar);
filtroTipo.addEventListener('change', carregar);

api.anos().then(anos => anos.forEach(a => filtroAno.add(new Option(a, a)))).catch(() => {});
carregar();
