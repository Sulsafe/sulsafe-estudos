# TUTOR_SULSAFE_REPORT.md — Botão "Criar com o TUTOR-Sulsafe"

**Data:** 24/11/2026 · **Atualizado em:** 25/11/2026 (saneamento da documentação: 192 testes, push e domínio já publicados)
**Escopo:** Fases 1, 2 e 3 do `ROADMAP_SULSAFE.md` e a distribuição de conteúdo, implementadas, aplicadas ao Supabase e homologadas em produção em 24/11/2026.
**Referência:** fluxo 3C da MR Tecnologia (homologado em 23/11/2026). A MR não foi alterada.

---

## 1. O que o usuário vê

No menu, **Criar com o TUTOR-Sulsafe** (ADMIN e PROFESSOR). O botão também aparece no topo da Área do Professor e, no Modo Deus, no painel "PROFESSOR I.A — API" quando a config está ativa.

Fluxo da tela:

1. Escolhe **Matéria de apoio / Curso / Palestra**.
2. Digita **só o assunto** (ex.: "Crie um curso sobre NR 35 para novos colaboradores"). O front detecta as NRs citadas usando a base local da Secretária e mostra quais serão usadas como contexto.
3. Clica em **Criar com o TUTOR-Sulsafe**. O worker monta a ementa, grava como **rascunho** e devolve:
   - título, descrição, público-alvo, objetivos;
   - módulos e aulas em `<details>` (revisão visual, sem edição — igual à MR).
4. O usuário **Aprova** ou **Rejeita** (com motivo).
5. Depois de aprovado, escolhe **Materializar**: informa a NR (1–38), o formato (videoaula ou material com URL https) e **para onde vai**:
   - **Turma, trilha ou aluno individual** — vincula o conteúdo em `turma_materiais`; o aluno vê em **Meus Cursos / Trilhas**;
   - **Todos os alunos (catálogo da NR)** — publica o item no catálogo da NR;
   - **Só salvar como rascunho interno** — mantém `publico = false`, visível só para ADMIN/PROFESSOR.
6. A ementa completa (módulos e aulas) fica anexada à descrição do conteúdo materializado.
7. Mesmo após materializar, o botão **Ajustar distribuição** permite trocar o destino; **Publicar para todos / Tornar privado** faz a liberação ou o recolhimento.

Nada é publicado automaticamente. Aluno não vê rascunho (RLS). A liberação continua sendo decisão humana explícita.

---

## 2. Arquitetura (desenho da MR, infra da SulSafe)

| MR (referência) | SulSafe (implementado) |
|---|---|
| Next.js API routes `/api/v1/ai/studio/*` | Supabase Edge Function `tutor-sulsafe` |
| OpenMAIC em Docker `127.0.0.1:3001` | Provedor configurado via `config_ia_professor` (BYOA / API SulSafe) |
| Postgres + GUCs + `mr_app` | Supabase + RLS + `auth.uid()` + JWT `app_metadata.empresa_id` |
| `DRAFT_AI` em `courses` + `modules` + `lessons` | `ia_jobs` + `ia_conteudos` → `videoaulas` / `materiais` (não existe tabela `cursos` na SulSafe) |
| `prompt_base` no banco + instrução JSON via seed | `montarPromptTutor()` puro no front + base das 38 NRs |
| Confiança na API route | Edge Function valida o JWT do chamador por RPC antes de usar `service_role` |
| Chave em `infra/.env` | Chave no Supabase Vault; `service_role` lê via RPC |

### Arquivos criados

- `supabase/migrations/20261124010000_ia_jobs_conteudos.sql` — jobs, conteúdos, RLS, RPCs de criação/status/revisão (DEC-002 Opção C).
- `supabase/migrations/20261124020000_tutor_materializacao.sql` — listagem de rascunhos e materialização em videoaula/material com `nr_id`.
- `supabase/migrations/20261124030000_tutor_worker_config.sql` — leitura da chave do Vault só para `service_role` + flag leve para a UI.
- `supabase/migrations/20261124040000_empresas_convite.sql` — tabela mínima `empresas`, RLS e RPC `sulsafe_pode_convidar_empresa` (D-TUTOR-11, Opção A).
- `supabase/migrations/20261124050000_corrige_referencia_vault.sql` — corrige a extração do nome do segredo (`vault:` tem 6 caracteres; o nome começa na posição 7). Sem isso, a RPC devolvia "Chave de API ... não encontrada no Vault" (D-TUTOR-14).
- `supabase/migrations/20261124100000_tutor_distribuicao.sql` — anexa a ementa à descrição materializada e adiciona `sulsafe_direcionar_conteudo_tutor` / `sulsafe_publicar_conteudo_tutor`, com trilha de quem decidiu a distribuição.
- `supabase/functions/admin-convidar-usuario/index.ts` — convite do ADMIN com `service_role`; injeta `app_metadata: { empresa_id }` no `createUser`, envia o link e ajusta o perfil, com rollback se o envio falhar.
- `supabase/functions/tutor-sulsafe/index.ts` — worker com modos REAL e STUB, adaptador nativo → pt-BR, tratamento de erro.
- `supabase/functions/tutor-sulsafe/extrair-json.js` — parser único (Deno + Node) que captura bloco markdown em qualquer posição ou o trecho entre o primeiro `{` e o último `}`; JSON inválido lança erro e vira job `ERRO`. Exigido pela revisão de arquitetura.
- `js/tutor-sulsafe.js` — módulo puro (prompt, extração de NRs, adaptador, validação).
- `js/views/tutor.js` — tela do botão e da revisão humana.
- `tests/ia-jobs-conteudos.test.mjs`, `tests/tutor-sulsafe.test.mjs`, `tests/tutor-materializacao.test.mjs`, `tests/tutor-worker.test.mjs`, `tests/tutor-json.test.mjs`, `tests/tutor-distribuicao.test.mjs`, `tests/empresas-convite.test.mjs`.

### Arquivos alterados

- `js/supabase-client.js` — helpers `sbCriarJobTutor`, `sbGerarComTutor`, `sbTutorHabilitado`, `sbListarRascunhosTutor`, `sbRevisarRascunhoTutor`, `sbMaterializarRascunhoTutor`, `sbDirecionarConteudoTutor`, `sbPublicarConteudoTutor`, `sbListarEmpresas`, `sbCriarEmpresa`, `sbConvidarUsuarioEmpresa` e extração da mensagem pt-BR da Edge Function em `erroAmigavelFunction`.
- `js/main.js` / `js/app.js` — registro da view `tutor` e item de menu.
- `js/views/admin.js` — placeholder "Criar com I.A" virou atalho real; painel "Empresas e Convites" (cadastro de empresa + envio de convite).
- `js/views/professor.js` — botão "Criar com o TUTOR-Sulsafe" no topo da Área do Professor.
- `package.json`, `DECISIONS_SULSAFE.md`, `ROADMAP_SULSAFE.md`.

---

## 3. Decisões registradas

| ID | Decisão |
|---|---|
| D-TUTOR-01 | DEC-002 Opção C: `empresa_id` vem do claim `app_metadata.empresa_id` do JWT; nenhuma coluna nova em `profiles`; catálogo das 38 NRs continua global. |
| D-TUTOR-02 | A saída nunca é publicada. Rascunho → aprovação → materialização com `publico = false` → liberação posterior separada. |
| D-TUTOR-03 | Contrato público em pt-BR (`titulo`, `descricao`, `publicoAlvo`, `objetivos`, `modulos[].aulas[]`), convertido do formato nativo do OpenMAIC no único adaptador. |
| D-TUTOR-04 | Chave de API apenas no Vault. `anon`/`authenticated` não recebem EXECUTE na RPC de worker; a UI recebe só um booleano de "habilitado". |
| D-TUTOR-05 | Modo `STUB` (`TUTOR_SULSAFE_STUB=1`) para homologar o fluxo sem chave e sem custo. Não é usado em produção. |
| D-TUTOR-06 | Sem Docker, Next.js, Redis, LiveKit ou OpenMAIC local na SulSafe. |
| D-TUTOR-11 | Origem do claim: **Opção A**. ADMIN cadastra a empresa e convida por Edge Function com `service_role`; o claim `app_metadata.empresa_id` nasce no `createUser`. |
| D-TUTOR-12 | `usuario_empresas` (Opção C) pré-aprovada para evolução futura, quando houver multiempresa real. Fora desta etapa. |
| D-TUTOR-13 | Domínio de e-mail descartado por risco de segurança. |
| D-TUTOR-14 | Correção da extração de `vault:<nome>`: `substring(... from 7)`; migration 20261124050000 + teste de regressão. |
| D-TUTOR-15 | Distribuição explícita após a materialização: turma/trilha/aluno, catálogo da NR ou rascunho interno; ementa anexada à descrição e liberação auditada. |

---

## 4. Validação local

- `npm test` → **192 testes, 192 passando** (baseline era 135). Inclui 6 testes unitários do parser de JSON, o teste estático que barra o retorno à remoção ancorada de crases, 8 testes da Opção A, o teste de regressão da extração de `vault:<nome>` e os testes de direcionamento/publicação (`tests/tutor-distribuicao.test.mjs`).
- `npm run check` → 36 arquivos analisados, **0 problemas**.
- Testes de runtime com PGlite cobrem: isolamento por empresa, RBAC, HITL, duplicata de materialização, NR inválida, ausência de URL, e negação de acesso a aluno.
- Os 8 testes da Opção A provam que o JWT do convidado (simulado com o mesmo `app_metadata` enviado ao `createUser`) faz `sulsafe_empresa_id()` devolver a empresa correta e que o RLS isola jobs e rascunhos. O Auth real não é simulado por Docker — a integração com a Admin API é verificada por contrato estático da Edge Function.

### Deploy executado em 24/11/2026 (projeto `acqbidvknbqppkjidvsq`)

- **12 migrations aplicadas**: as 6 pendentes das fases anteriores (20261025… a 20261124000000), as 4 do Tutor, a correção 20261124050000 e a migration de distribuição 20261124100000. O `supabase migration list` agora mostra todas as locais com versão remota correspondente.
- **2 Edge Functions deployadas e ativas**: `tutor-sulsafe` e `admin-convidar-usuario`.
- **Vault**: segredo `sulsafe_ia_chave_global` presente (sem valor em log/resposta). `config_ia_professor` configurada com `provedor = gemini`, `modelo = gemini-2.5-flash`, `ativo = true` e referência `vault:sulsafe_ia_chave_global`.
- **Smoke test REAL**, executado na interface local (`http://localhost:5173/login.html`): empresa `SulSafe Homologacao` cadastrada; assunto "Crie um curso sobre NR 35 para novos colaboradores" com NR-35 detectada; job `73ff5a02-...` → `CONCLUIDO`; ementa "NR-35: Trabalho em Altura - Primeiros Passos na Obra" em `DRAFT`/rascunho; aprovação e materialização em **VIDEOAULA na NR 35**.
- **Validação HITL no banco**: `ia_jobs.status = CONCLUIDO`, `ia_conteudos.aprovado = true`, `publicado = false`, `materializado_tipo = VIDEOAULA`, `materializado_nr_id = 35`; `videoaulas.publico = false`. Nada foi liberado para alunos.
- **Bug encontrado e corrigido durante o smoke test**: `substring(api_key_encriptada from 6)` devolvia `:sulsafe_ia_chave_global` e a RPC respondia "Chave de API do Professor I.A. não encontrada no Vault". Corrigido para `from 7` na migration original + migration 20261124050000 + teste de regressão.

---

## 5. Estado do deploy e próximos passos

Concluído: migrations, Vault, configuração do provedor, deploy das duas Edge Functions, cadastro da empresa, smoke test REAL com aprovação/materialização, push ao GitHub (`2d929cf`), deploy **Ready/Production** na Vercel e front atualizado servido em `https://www.sulsafe.com.br`. A correção do 502/recuo do provedor foi homologada em produção (`ae2567a`) e a distribuição de conteúdo em `2d929cf`.

Pendente para homologação completa:

1. Convidar um usuário de teste em **Modo Deus → Empresas e Convites** e verificar o claim `app_metadata.empresa_id` no primeiro JWT (o e-mail de teste ainda não foi informado).
2. Validar, com uma conta **Aluno**, que o conteúdo direcionado aparece em **Meus Cursos / Trilhas** e que rascunhos/`publico = false` continuam invisíveis (RLS).

---

## 6. Limitações conhecidas

- Não há edição de campos da ementa na tela (revisão é visual/HITL, igual à MR). Ajustes finos feitos no registro materializado, depois.
- Não há geração de mídia, cenas completas ou TTS (`outlineReview: 'wait'`).
- Não há cobrança automática: `transacoes` continua manual, conforme regra da SulSafe.
- "Corrigir" no fluxo descrito pelo proprietário é a correção de **formato** (adaptador + validação) e a revisão humana; não é um corretor ortográfico independente.
- Um usuário por empresa (`app_metadata.empresa_id`). Múltiplas empresas por usuário segue em aberto.
