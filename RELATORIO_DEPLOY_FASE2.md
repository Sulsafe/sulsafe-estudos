# RELATORIO_DEPLOY_FASE2.md — Edge Function e GitHub

**Data:** 25/11/2026
**Autorização:** explícita do proprietário para publicar a Edge Function e enviar o código ao GitHub (Fase 2 do roteiro `PASSO_A_PASSO_DEPLOY.md`).

## 1. Resultado

| Item | Status | Evidência |
|---|---|---|
| Edge Function `tutor-sulsafe` | **publicada** | `functions list`: `status ACTIVE`, `version 3`, `updated_at 1795627003321`, `verify_jwt true` |
| Push GitHub | **realizado** | `git ls-remote`: `HEAD` e `refs/heads/main` = `e2198a3a92e76bb04703c8ec0d3a4b13f34ae735` |
| Chaves/segredos | **nenhum vazado** | varredura no clone: 176 arquivos, 0 achados (somente `anon key` pública) |
| Vercel | **não executado** | nenhum deploy iniciado nesta etapa |

## 2. Comandos executados

```bash
npx supabase functions list --project-ref acqbidvknbqppkjidvsq
# antes: tutor-sulsafe ACTIVE version 2

npx supabase functions deploy tutor-sulsafe --project-ref acqbidvknbqppkjidvsq
# HostedMutationConsentRequiredError — nada alterado; CLI em modo agente exige --yes

npx supabase functions deploy tutor-sulsafe --project-ref acqbidvknbqppkjidvsq --yes
# Confirmed by --yes: Deploy 1 Function
# Upload: index.ts, processar-job-fase5.js, extrair-json.js, js/tutor-contratos-fase5-core.js
# "Deployed Functions." — aviso não bloqueante: Docker is not running

npx supabase functions list --project-ref acqbidvknbqppkjidvsq
# depois: tutor-sulsafe ACTIVE version 3
```

Para o GitHub, a pasta de trabalho não é repo Git ativo. Foi clonado o repositório oficial em área temporária (`C:\Users\maike\AppData\Local\Temp\opencode\sulsafe-estudos-oficial`), sincronizada a árvore e executado:

```bash
git clone --branch main https://github.com/Sulsafe/sulsafe-estudos.git sulsafe-estudos-oficial
node sincroniza-repo.mjs     # 176 arquivos copiados, sem .env
node varredura-clone.mjs     # 176 arquivos, 0 achados
npm ci                       # 16 pacotes, 0 vulnerabilidades
npm test                     # 281 testes verdes
npm run check                # 44 arquivos, 0 problemas
git add -A
git commit -m "feat(fase5): agente direcionado com provas e modulos, HITL, distribuicao e exportacao CSV"
git push origin main         # 2d929cf..e2198a3 main -> main
git ls-remote https://github.com/Sulsafe/sulsafe-estudos.git HEAD refs/heads/main
```

**Commit:** `e2198a3a92e76bb04703c8ec0d3a4b13f34ae735` — 65 arquivos, 12.929 inserções, 85 remoções. Nenhum force push, rebase ou rewrite de histórico publicado.

## 3. Segurança

- `.gitignore` cobre `.env`, `.env.local`, `.env.*.local`, `node_modules/` e `*.bak`; `supabase/.gitignore` cobre `.temp`, `.env.keys` e variantes locais.
- `git ls-files` não contém nenhum `.env`; não havia arquivos `.env*` na árvore sincronizada.
- A varredura procurou tokens de provedor, `gh[pousr]_`, chaves privadas, senhas literais, `service_role` em claro e JWTs não classificados: **0 achados**. A única chave literal é a `anon key`, pública por design, em `js/supabase-client.js`.
- Nenhuma variável de ambiente da Edge Function foi alterada no deploy; a chave Gemini permanece no Vault.

## 4. Observações

- A CLI 3.4.0 avisa que `--project-ref` está deprecado em favor de `--remote=<ref>`; o projeto vinculado é `acqbidvknbqppkjidvsq` (produção), e a flags ainda funcionou.
- `Docker is not running` foi um aviso: o deploy usou upload direto e terminou com sucesso.
- Não foi possível consultar variáveis do painel Supabase nesta sessão; a checagem de `TUTOR_SULSAFE_STUB=1` continua como item de smoke manual.
- A pasta original continua sem `.git`; o commit foi feito no clone temporário, que agora está limpo e alinhado ao remoto.
- O push ao GitHub pode disparar deploy automático na Vercel; **nenhum deploy foi iniciado ou verificado por mim** nesta etapa (seção 6 do roteiro segue pendente).

## 5. Critérios de aceite

- [x] Edge Function deployada (v3, ACTIVE).
- [x] Código commitado e enviado ao GitHub (`e2198a3`).
- [x] Nenhuma chave vazada (0 achados em 176 arquivos).
- [ ] Vercel `Ready / Production` — fora do escopo desta autorização.
