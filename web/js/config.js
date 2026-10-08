// Endereço da API. Em desenvolvimento local usa a API rodando na própria máquina.
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

export const API_BASE = LOCAL ? 'http://localhost:8000' : 'https://cmtt-api.onrender.com';
