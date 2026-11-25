# Relatório — Resolução dos bloqueios do smoke (Fase 3)

**Data:** 25/11/2026  
**Ambiente:** Supabase `acqbidvknbqppkjidvsq` (produção) · Vercel `sulsafe-estudos-4ppk` (`https://www.sulsafe.com.br`)  
**Autorização:** correção SQL manual, guia de variáveis e análise/correção de `vercel.json` concedidas pelo proprietário em 25/11/2026.  
**Resultado:** prova NR-10 destravada e **validada como distributível**; guia da Vercel criado; causa dos deep links 404 identificada e patch aplicado **localmente**, sem push/deploy.

---

## 1. Prova NR-10 destravada — RESOLVIDO

### 1.1 Causa raiz (era dupla)

1. `provas_direcionadas.publicado` estava **`false`**. A aprovação pelo caminho legado (`sbRevisarRascunhoTutor`) marcou apenas `ia_conteudos.aprovado = true`, sem publicar a prova. A RPC correta (`sulsafe_aprovar_prova_ia`) não podia ser reaplicada: encerra com `P0001 "Esta prova já foi aprovada"` antes de qualquer `UPDATE`.
2. `ia_jobs.empresa_id` e `ia_conteudos.empresa_id` estavam **nulos**, e o Admin de teste não tinha o claim `app_metadata.empresa_id`. Como `sulsafe_prova_gerenciada()` compara com `=` (não `is not distinct from`), `NULL = NULL` resulta em `NULL`, mantendo `sulsafe_prova_distribuivel()` em `false` mesmo após publicar.

> A origem do claim é `auth.jwt() -> 'app_metadata' ->> 'empresa_id'` (`20261124010000_ia_jobs_conteudos.sql:20-31`, DEC-002). `sulsafe_is_admin()` lê `profiles`, não o JWT, então acrescentar o claim não altera a autorização do Admin.

### 1.2 Correção aplicada

Um único `UPDATE` atômico via CLI autenticada (com `--yes`, exigido em modo agente), sem migration nova e sem editar código da Fase 5:

```sql
with j as (
  update public.ia_jobs
     set empresa_id = '9b1dc8db-dc1b-4109-9071-5423346de35e'
   where id = '228ba207-0d2d-433e-9443-5cbf450e1fab' and empresa_id is null
  returning 1 as n
), c as (
  update public.ia_conteudos
     set empresa_id = '9b1dc8db-dc1b-4109-9071-5423346de35e'
   where id = '9f2a868a-74d0-4b63-98da-add2ef082c63' and empresa_id is null
  returning 1 as n
), p as (
  update public.provas_direcionadas
     set publicado = true
   where id = '60be610d-35dd-4fa2-b8c0-2d2ec6928b9e' and publicado is not true
  returning 1 as n
), u as (
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                          || jsonb_build_object('empresa_id', '9b1dc8db-dc1b-4109-9071-5423346de35e')
   where id = '9fd31d05-8a57-4f8e-9d64-3b002edcdab4'
     and coalesce(raw_app_meta_data ->> 'empresa_id', '') = ''
  returning 1 as n
)
select (select count(*) from j) as jobs_atualizados,
       (select count(*) from c) as conteudos_atualizados,
       (select count(*) from p) as provas_publicadas,
       (select count(*) from u) as usuarios_com_claim;
```

Resultado: `jobs_atualizados 1`, `conteudos_atualizados 1`, `provas_publicadas 1`, `usuarios_com_claim 1`.

- **Não** foram preenchidos `distribuido_por` nem `distribuido_em`: `sulsafe_prova_distribuivel()` exige `pd.distribuido_por is null`. A sugestão original de preenchê-los foi descartada porque tornaria a RPC falsa.
- A alteração em `auth.users` foi restrita à conta de teste `smoke.fase3@sulsafe.com.br` (`9fd31d05-8a57-4f8e-9d64-3b002edcdab4`). Nenhuma outra conta foi tocada.
- Empresa utilizada: `SulSafe Homologacao` (`9b1dc8db-dc1b-4109-9071-5423346de35e`, `ativo = true`), única empresa existente no remoto.

### 1.3 Validação

**Estado persistido** (`db query --remote --read-only`):

| Campo | Antes | Depois |
|---|---|---|
| `provas_direcionadas.publicado` | `false` | **`true`** |
| `ia_jobs.empresa_id` | `null` | `9b1dc8db-…` |
| `ia_conteudos.empresa_id` | `null` | `9b1dc8db-…` |
| `provas_direcionadas.distribuido_por` | `null` | `null` |
| `provas_direcionadas.distribuido_em` | `null` | `null` |
| `ia_conteudos.aprovado` / `rejeitado` | `true` / `false` | `true` / `false` |
| `ia_conteudos.conteudo->>'origem'` | `TUTOR_SULSAFE` | `TUTOR_SULSAFE` |

**RPCs com o JWT do Admin de teste** (após `auth.refreshSession()` para buscar o novo claim):

| Chamada | Antes | Depois |
|---|---|---|
| `sulsafe_empresa_id()` | `null` | `9b1dc8db-dc1b-4109-9071-5423346de35e` |
| `sulsafe_prova_gerenciada(provaId)` | `false` | `true` |
| `sulsafe_prova_distribuivel(provaId)` | `false` | **`true`** |
| `sulsafe_listar_provas_aprovadas_ia()` | `[]` | 1 item: **Prova de NR-10**, `nr_id 10`, 5 questões, `prova_id 60be610d-…` |

Claim do JWT: `app_metadata` era `{"provider":"email","providers":["email"]}` e passou a incluir `"empresa_id":"9b1dc8db-dc1b-4109-9071-5423346de35e"`. O `sub` permaneceu `9fd31d05-…`.

**Limite restante:** não há alunos em produção (`profiles`: 2 admin, 1 professor, 0 aluno). Portanto, os destinos `TURMA`, `ALUNO` e `CATALOGO` ainda não podem ser homologados. O destino `INTERNO` não depende de alunos.

---

## 2. Guia de variáveis da Vercel — CRIADO

Arquivo: `CONFIG_VERCEL.md`.

Contém: origem dos valores em **Supabase → Project Settings → API**; passo a passo em **Vercel → Settings → Environment Variables**; variáveis `SUPABASE_URL` e `SUPABASE_ANON_KEY`; ambientes Production/Preview/Development; verificação via `GET /api/tutor/provas-pendentes`; e regras de segurança. **Nenhum valor real de chave foi gravado.**

**Atualização 25/11/2026 (autorização de deploy completo):** as duas variáveis foram cadastradas via CLI (`vercel env add`, escopo `sulsafe-treinamentos-dbc53591`, projeto `sulsafe-estudos-4ppk`, ambiente Production, tipo `Secret`, valores ocultos) e o deployment foi refeito (`MoVNp6Ymd5jsAsr7oM3pwdc2zZZ4`). A fila HITL passou a responder **HTTP 200**. O painel da Vercel não foi usado — a autenticação foi feita por device login na CLI autorizada pelo proprietário.

---

## 3. Deep links 404 — causa identificada, patch aplicado e publicado

### 3.1 Evidência

`vercel.json` tinha `cleanUrls: true` e rewrites com destination `/login.html`. A documentação oficial da Vercel (`https://vercel.com/docs/project-configuration/vercel-json`, seção `cleanUrls`) afirma:

> When set to true, all HTML files and Vercel functions will have their extension removed. When visiting a path that ends with the extension, a 308 response will redirect the client to the extensionless path. For example, a static file named `about.html` will be served when visiting the `/about` path.

Ou seja, com `cleanUrls` o destino canônico é `/login`, não `/login.html`. Antes do patch, `/admin/provas-pendentes`, `/admin/provas-distribuicao`, `/admin/provas-resultados` e `/aluno/prova/:id` retornavam `404 NOT_FOUND` (`x-vercel-id: gru1::6qjhr-1795629085776-5e4e25448fa7`), enquanto `/` e `/login` respondiam 200 porque o próprio `cleanUrls` já serve os arquivos sem extensão.

### 3.2 Patch aplicado (somente no working tree)

- `vercel.json`: 5 destinations `/login.html` → `/login` (linhas 7-11).
- Três asserts de teste que fixavam o valor antigo foram alinhados:
  - `tests/fase5-aprovacao-prova.test.mjs:684`
  - `tests/fase5-distribuicao-prova.test.mjs:751`
  - `tests/fase5-painel-professor.test.mjs:517`

Gates executados após a edição:

| Gate | Resultado |
|---|---|
| `npm test` | **281/281** verdes, 0 falhas |
| `npm run check` | 44 arquivos, **0** problemas |

### 3.3 Por que não houve push/deploy

Inicialmente o patch ficou apenas local porque o remoto publica automaticamente na Vercel. **Com a autorização de deploy completo de 25/11/2026**, o patch foi commitado (`989cdae`) e enviado a `main`; o build automático terminou em `success` (`DZzo4JsLLTSPMX8ahNcMv51ewmC5`) e as quatro URLs passaram a responder HTTP 200 em produção, com a tela carregando corretamente (`<base href="/">` já presente em `login.html`).

---

## 4. O que NÃO foi feito

- Nenhuma migration nova, nenhuma migration aplicada editada e nenhuma Edge Function redesployada.
- Nenhuma alteração de lógica da Fase 5; apenas 3 asserts de teste alinhados à correção de configuração do `vercel.json`.
- Nenhuma migration nova e nenhuma Edge Function redesployada; o único push foi o commit de configuração `989cdae`, com build automático bem-sucedido.
- Nenhuma credencial real registrada em arquivo, log ou relatório.
- Nenhuma distribuição da prova para alunos (não há alunos no ambiente).

---

## 5. Estado final consolidado

| Item | Situação |
|---|---|
| Prova NR-10 publicada e distributível | ✅ `sulsafe_prova_distribuivel = true` (validado com JWT) |
| `CONFIG_VERCEL.md` | ✅ Criado, sem chaves reais |
| Fila HITL em produção | ✅ HTTP 200 após `vercel env add` + redeploy |
| Deep links | ✅ Patch publicado em `989cdae`; 4 rotas com HTTP 200 em produção |
| Distribuição com alunos | ⏳ Bloqueada por ausência de alunos em produção |
| Gates locais | ✅ `npm test` 281/281 · `npm run check` 44/0 |
