import { api } from './api.js';
import { API_BASE } from './config.js';

document.getElementById('link-docs').href = `${API_BASE}/docs`;

const form = document.getElementById('form-feedback');
const mensagem = document.getElementById('fb-mensagem');
const erroMensagem = document.getElementById('fb-erro');
const status = document.getElementById('status');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const texto = mensagem.value.trim();
  if (texto.length < 3) {
    mensagem.setAttribute('aria-invalid', 'true');
    erroMensagem.textContent = 'Escreva uma mensagem com pelo menos 3 caracteres.';
    mensagem.focus();
    return;
  }
  mensagem.removeAttribute('aria-invalid');
  erroMensagem.textContent = '';

  const botao = form.querySelector('button[type="submit"]');
  botao.disabled = true;
  status.textContent = 'Enviando…';
  status.className = 'status';
  try {
    const avaliacao = form.querySelector('input[name="avaliacao"]:checked')?.value;
    const resposta = await api.enviarFeedback({
      nome: document.getElementById('fb-nome').value,
      mensagem: texto,
      avaliacao: avaliacao ? Number(avaliacao) : null,
    });
    status.textContent = resposta.mensagem;
    status.className = 'status sucesso';
    form.reset();
  } catch (erro) {
    status.textContent = erro.message;
    status.className = 'status erro';
  } finally {
    botao.disabled = false;
  }
});
