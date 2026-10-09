// Endereço da API. Em desenvolvimento local usa a API rodando na própria máquina.
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

export const API_BASE = LOCAL ? 'http://localhost:8000' : 'https://cmtt-api.onrender.com';

// Login da área administrativa (Supabase Auth). A chave "publishable" é pública por definição:
// ela só permite o login; os dados ficam protegidos pelo RLS e pela própria API.
export const SUPABASE_URL = 'https://aigencggrhljwzibbbfo.supabase.co';
export const SUPABASE_CHAVE_PUBLICA = 'sb_publishable_8IJgdwxPw12UbWkTqNZNdQ_4_Hlt-Ja';
