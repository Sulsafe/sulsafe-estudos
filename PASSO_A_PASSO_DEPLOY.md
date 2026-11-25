# PASSO_A_PASSO_DEPLOY.md — Fase 5 (Etapas 1-8)

**Data:** 25/11/2026
**Status do documento (atualizado em 25/11/2026):** as **seções 3, 4 e 5 foram executadas** mediante autorização explícita — 8 migrações aplicadas e validadas, Edge Function `tutor-sulsafe` publicada na versão 3 e código enviado ao GitHub no commit `e2198a3`. A **seção 6 (Vercel)** segue **não executada**.

Este passo a passo cobre a promoção da Fase 5 do Agente Direcionado: 8 migrations locais (`20261125000000` a `20261125070000`), rotas em `api/`, telas em `js/views/`, o exportador CSV da Etapa 8 e os contratos Zod compartilhados.

---

## 0. Pré-condição — autorização

O fluxo de governança exige autorização explícita do proprietário antes de qualquer mudança remota (`ROADMAP_SULSAFE.md`, §8). Até ela existir, **apenas os passos locais (§1) podem ser executados**.

Dados do ambiente (já registrados em `DECISIONS_SULSAFE.md`):

| Item | Valor |
|---|---|
| Projeto Supabase | `acqbidvknbqppkjidvsq` (`project_id` em `supabase/config.toml`) |
| Repositório | `https://github.com/Sulsafe/sulsafe-estudos.git` |
| Branch acompanhada | `main` |
| Projeto Vercel | `sulsafe-estudos-4ppk` |
| Domínio | `https://www.sulsafe.com.br` |
| Último push homologado | `2d929cf` (24/11/2026) |
| Edge Functions já publicadas | `tutor-sulsafe`, `admin-convidar-usuario` |
| Segredo da IA | `sulsafe_ia_chave_global` no Supabase Vault (nunca em arquivo/chat) |

---

## 1. Verificação local (pode ser executada sem autorização)

```bash
node --version          # >= 18
npm test                # 281 testes verdes na Etapa 8
npm run check           # 44 arquivos, 0 problemas
```

Conferir também:

- Nenhum arquivo `.env` na raiz e nenhuma chave de provedor/senha em arquivo. A varredura da Etapa 8 cobriu `js/`, `api/`, `supabase/functions/` e arquivos da raiz: **81 arquivos, 0 achados**; a única chave literal é a `anon key`, pública por design, em `js/supabase-client.js`.
- `service_role` aparece apenas como `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` nas Edge Functions e como variável de ambiente em `popular-nrs.mjs` — nunca como valor.
- Nenhuma migration já aplicada foi editada: a Fase 5 entra com arquivos novos numerados de `20261125000000` a `20261125070000`.
- `vercel.json` já contém os rewrites `/admin/provas-pendentes`, `/admin/provas-distribuicao`, `/admin/provas-resultados` e `/aluno/prova/:id`, além dos headers de segurança e do CORS restrito.

---

## 2. Backup e janela de mudança

1. No painel do Supabase do projeto `acqbidvknbqppkjidvsq`, confirmar que existe backup recente (Database → Backups) antes de aplicar migrations.
2. Anotar o deploy da Vercel atualmente em Produção (para promoção reversa, §7).
3. Escolher janela de baixo uso. A Etapa 7 altera RPCs usadas pela tela de resultados e pela submissão do aluno; a Etapa 8 é somente front.

---

## 3. Aplicar as migrations no Supabase remoto — ✔ EXECUTADO EM 25/11/2026

```bash
# na raiz do repositório, com node >= 18
npx supabase link --project-ref acqbidvknbqppkjidvsq
npx supabase migration list --linked              # 17 aplicadas / 8 pendentes
npx supabase db push --remote --yes               # aplica as 8 pendentes, em ordem
npx supabase migration list --linked              # 25/25 aplicadas, 0 pendentes
```

Atenção: na CLI 3.4.0, `npx supabase db push` **sem `--remote` mira o stack local** (`127.0.0.1:54322`) e falha sem tocar no remoto; em modo agente, `--remote` exige `--yes`. Foi exatamente esse o caminho usado (`--remote --yes`), com autorização registrada.

Ordem esperada das pendentes da Fase 5:

| Migrations | Conteúdo |
|---|---|
| `20261125000000_fase5_fundacao.sql` | tipos `PROVA`/`MODULO`, HITL em provas/módulos |
| `20261125010000_fase5_estrutura_prova.sql` | `provas_questoes`, `provas_progresso`, materialização |
| `20261125020000_fase5_geracao_prova.sql` | dispatcher do worker e fila de pendentes |
| `20261125030000_fase5_aprovacao_prova.sql` | revisão, edição, aprovação/rejeição, auditoria |
| `20261125040000_fase5_distribuicao_prova.sql` | distribuição transacional e notificações |
| `20261125050000_fase5_realizacao_prova.sql` | realização pelo aluno e correção automática |
| `20261125060000_etapa3_1_quantidade_questoes.sql` | quantidade de 1..50 no job/prompt/contrato |
| `20261125070000_fase5_painel_professor.sql` | resultados, detalhe/gabarito e correção de discursivas |

Depois do push, conferir no SQL Editor do remoto (somente leitura):

```sql
select version, description, applied_at
from supabase_migrations.schema_migrations
order by version desc
limit 12;
```

**Regras:** não editar migration aplicada; se algo falhar, corrigir com uma migration nova e forward-only. Nunca usar `db reset` nem `truncate` no remoto.

---

## 4. Atualizar a Edge Function do Professor I.A — ✔ EXECUTADO EM 25/11/2026

A Fase 5 mudou o worker `tutor-sulsafe` (dispatcher `PROVA`/`MODULO`, leitura de `ia_jobs.quantidade_questoes` e contrato Zod). Após as migrations:

```bash
npx supabase functions deploy tutor-sulsafe --project-ref acqbidvknbqppkjidvsq --yes
```

Na CLI 3.4.0, o primeiro comando sem `--yes` parou em `HostedMutationConsentRequiredError` sem alterar nada; a seguinte confirmação explícita foi autorizada pelo proprietário. O deploy subiu `index.ts`, `processar-job-fase5.js`, `extrair-json.js` e `js/tutor-contratos-fase5-core.js`. `functions list` confirma `tutor-sulsafe` **ACTIVE, versão 3**, `verify_jwt: true`. O aviso `Docker is not running` não impediu o deploy (CLI usou upload direto).

- Confirmação remota: `status ACTIVE`, `version 3`, atualizado em 25/11/2026; `admin-convidar-usuario` permanece na versão 1.
- A chave Gemini continua no Vault sob `sulsafe_ia_chave_global`; não reenviar chave pelo chat nem pelo navegador. Nenhuma variável de ambiente foi alterada no deploy.
- Não foi possível inspecionar variáveis pelo painel nesta sessão; a checagem de `TUTOR_SULSAFE_STUB` deve ser feita no dashboard antes do smoke real.

---

## 5. Enviar o código ao GitHub — ✔ EXECUTADO EM 25/11/2026

A pasta de trabalho não é um repo Git ativo; por isso o commit foi feito em um clone temporário do repositório oficial, sincronizado com a árvore de trabalho. Antes do commit: varredura de segredos nos 176 arquivos do clone (**0 achados**, apenas a `anon key` pública), `npm ci` sem vulnerabilidades, `npm test` (281 verdes) e `npm run check` (44 arquivos, 0 problemas).

```bash
git clone https://github.com/Sulsafe/sulsafe-estudos.git sulsafe-estudos
cd sulsafe-estudos
git status --short
git diff --stat
git add -A
git commit -m "feat(fase5): agente direcionado com provas e modulos, HITL, distribuicao e exportacao CSV"
git push origin main
```

Resultado: commit **`e2198a3a92e76bb04703c8ec0d3a4b13f34ae735`** (65 arquivos, 12.929 inserções, 85 remoções). `git ls-remote` confirma `HEAD` e `refs/heads/main` em `e2198a3` — o push foi aceito, sem force push e sem reescrita de histórico (`2d929cf..e2198a3`). Nenhum `.env`, chave de serviço ou token foi incluído.

Arquivos que fazem parte desta entrega (além dos relatórios e da governança): as 8 migrations listadas em §3; `supabase/functions/tutor-sulsafe/`; `api/tutor/` e `api/aluno/provas/`; `js/views/provas-*.js`, `js/views/prova-aluno-ia.js`, `js/supabase-client.js`, `js/tutor-contratos-fase5-core.js`, `js/exportar-resultados-ia.js`, `js/main.js`, `js/app.js`; `package.json`/`package-lock.json`; `vercel.json`; suítes em `tests/`.

**Proibido:** `git push --force`, reescrever histórico publicado ou enviar segredos/`.env`.

---

## 6. Verificar o build e a publicação na Vercel

1. Painel Vercel → projeto `sulsafe-estudos-4ppk` → **Deployments**; confirmar que o push em `main` gerou um novo deploy e aguardar `Ready / Production`.
2. Abrir **Build Logs** e conferir que não há erro de import e que as funções em `api/` foram incluídas.
3. Conferir `https://www.sulsafe.com.br` (landing) e `/login.html` (app), com cache fresca.
4. Smoke funcional com conta real de professor/admin:
   - `/admin/provas-pendentes` → aprovar uma prova I.A.;
   - `/admin/provas-distribuicao` → distribuir a um aluno da mesma empresa;
   - `/aluno/prova/:id` → aluno responde e envia;
   - `/admin/provas-resultados` → **Ver Resultados** → **Exportar Resultados**; abrir o CSV no Excel e conferir acentos, `;`, nota com vírgula decimal e BOM (sem "quadradinho" no primeiro cabeçalho).
5. Conferir uma conta da Empresa B: não deve listar nem exportar resultados da Empresa A.
6. `Cache-Control: no-store` nas rotas de API e nenhum segredo em DevTools/resposta HTTP.

---

## 7. Rollback (se algo falhar)

| Camada | Ação segura |
|---|---|
| Banco | Não desfazer migration aplicada. Gravar nova migration forward-only que corrija/reverta o efeito e aplicar com `npx supabase db push`. |
| Edge Function | Redeploy da versão anterior (`git checkout <commit anterior> -- supabase/functions/tutor-sulsafe` e `npx supabase functions deploy tutor-sulsafe ...`). |
| Front | Vercel → Deployments → deploy anterior → **Promote to Production**. |
| Código | `git revert <hash>` com novo commit e push em `main`. Nunca `--force`. |

---

## 8. Checklist de aceite para autorizar o deploy

- [x] Autorização do proprietário registrada (banco e Fase 2 em 25/11/2026).
- [x] `npm test` (281) e `npm run check` verdes no clone sincronizado.
- [ ] Backup recente conferido no Supabase (registrado como pendente em `RELATORIO_DEPLOY_FASE1_MIGRACOES.md`).
- [x] `npx supabase migration list --linked` mostrando as 8 migrations aplicadas (25/25 no total).
- [x] `tutor-sulsafe` redeployada (v3, ACTIVE). Checagem de `TUTOR_SULSAFE_STUB` no painel ainda pendente.
- [x] Push em `main` aceito pelo GitHub (`e2198a3`).
- [ ] Vercel `Ready / Production` em `sulsafe-estudos-4ppk`.
- [ ] Smoke real: distribuição → realização → resultados → CSV exportado legível no Excel.
- [ ] Isolamento entre empresas confirmado com conta real.
- [x] Nenhuma chave de serviço, token de provedor ou senha em arquivo/log/resposta (varredura no clone: 176 arquivos, 0 achados).

> Este documento é um roteiro. As seções 3 a 5 foram executadas em 25/11/2026 com autorização; evidências do banco em `RELATORIO_DEPLOY_FASE1_MIGRACOES.md` e da Fase 2 em `RELATORIO_DEPLOY_FASE2.md`. A seção 6 (Vercel) depende de nova autorização e **não foi executada**.
