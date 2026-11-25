# Configuração de variáveis de ambiente na Vercel — SulSafe Estudos

**Projeto Vercel:** `sulsafe-estudos-4ppk` · **Domínio:** `https://www.sulsafe.com.br`  
**Data:** 25/11/2026  
**Status:** guia operacional. Nenhuma variável foi definida e nenhum deploy foi executado nesta tarefa.

---

## Por que é necessário

As rotas Node em `api/` leem as variáveis no runtime. Em `api/tutor/provas-pendentes.mjs:62-69`:

```js
const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
if (!url || !anonKey) {
    responder(res, 500, {
        error: { code: 'CONFIGURACAO_AUSENTE', message: 'API de conteúdo não configurada.' }
    })
    return
}
```

Sem essas variáveis, a tela **“Provas Pendentes (IA)”** (`/admin/provas-pendentes`) não carrega a fila HITL e retorna HTTP 500.

A chave **anon** é pública por design; o isolamento é feito por RLS e RPCs `SECURITY DEFINER`. **Nunca use `SUPABASE_SERVICE_ROLE_KEY` aqui** — ela é exclusiva de servidor/Edge Functions e jamais deve chegar ao navegador.

---

## 1. Obter os valores no Supabase

1. Abra `https://supabase.com/dashboard` e selecione o projeto **`supabaseSulsafe`** (`acqbidvknbqppkjidvsq`).
2. Vá em **Project Settings → API**.
3. Em **Project URL**, copie a URL (formato `https://<PROJECT_REF>.supabase.co`).
4. Em **Project API keys**, copie a chave **`anon` / `public`** (formato `eyJ…`).
5. **Não** copie a chave `service_role`.

> Os valores reais não são reproduzidos neste arquivo. Os placeholders abaixo servem apenas para mostrar o formato esperado.

---

## 2. Definir as variáveis na Vercel

1. Acesse `https://vercel.com/dashboard` → projeto **`sulsafe-estudos-4ppk`**.
2. Aba **Settings → Environment Variables**.
3. Clique em **Add New** e cadastre as duas entradas:

| Key | Value (placeholder — substitua pelo valor real) | Ambientes |
|---|---|---|
| `SUPABASE_URL` | `https://<PROJECT_REF>.supabase.co` | **Production** (marque também Preview/Development se quiser homologar) |
| `SUPABASE_ANON_KEY` | `<ANON_KEY_PUBLICA>` | **Production** (idem) |

4. Confirme em **Add** / **Save**.
5. Faça **Redeploy** para que as variáveis cheguem ao runtime: **Deployments** → último deployment → **⋯ → Redeploy**.

> Este passo 5 **não foi executado** nesta tarefa. Novo deploy depende de autorização explícita.

---

## 3. Verificação após o redeploy

Com uma sessão de Admin ou Professor ativa no site:

```
GET https://www.sulsafe.com.br/api/tutor/provas-pendentes
Authorization: Bearer <JWT_DO_USUARIO>
cache-control: no-store
```

| Resultado | Interpretação |
|---|---|
| **200** com `{"provas":[…]}` | ✅ Configuração correta; a fila HITL voltou a funcionar. |
| **500** com `CONFIGURACAO_AUSENTE` | ❌ A variável não chegou ao runtime daquele deployment. |
| **401/403** com `FILA_INDISPONIVEL` | Variáveis OK; o usuário não tem permissão para a fila. |
| **502** com `FILA_INDISPONIVEL` | Variáveis OK; falha ao chamar a RPC no Supabase. |

---

## 4. Segurança e manutenção

- `SUPABASE_ANON_KEY` é pública; a proteção vem de RLS, grants mínimos e RPCs `SECURITY DEFINER` com `search_path = ''`.
- Nunca registrar `service_role` em arquivo, log, navegador, `localStorage`, URL ou resposta HTTP.
- Não versionar `.env*` — o `.gitignore` do repositório já cobre esse padrão.
- Ao trocar de projeto Supabase ou rotacionar a anon key, atualize **as duas** variáveis e faça redeploy.
- Para confirmar que nenhuma chave indevida foi versionada: `npm test` (teste de varredura de segredos) e `npm run check`.
