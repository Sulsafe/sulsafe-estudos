# Relatório — Deploy Fase 1: migrações no Supabase remoto

**Data:** 25/11/2026
**Autorização:** explícita do proprietário nesta sessão (“AUTORIZAÇÃO DE DEPLOY — FASE 1: MIGRAÇÕES NO SUPABASE”), com confirmação automática permitida.
**Escopo executado:** **somente banco de dados**. Sem push ao GitHub, sem deploy de Edge Function, sem deploy na Vercel.

## 1. Resultado

**SUCESSO.** As 8 migrações pendentes da Fase 5 foram aplicadas ao projeto remoto `acqbidvknbqppkjidvsq` (produção, região `us-east-1`, Postgres 17.11.0.003). Nenhum erro de sintaxe, nenhum conflito de tabela, nenhuma mudança manual fora de migration.

## 2. Autenticação e vinculação da CLI

| Verificação | Evidência |
|---|---|
| Node/npm | `v26.13.0` / `11.20.0` (atende `>= 18`) |
| Supabase CLI | `3.4.0` (via `npx`) |
| `SUPABASE_ACCESS_TOKEN` | `unset` |
| `~/.supabase/auth.json` | ausente |
| CLI autenticada | `npx supabase projects list` listou os projetos da conta, incluindo `acqbidvknbqppkjidvsq` (`ACTIVE_HEALTHY`) — portanto a CLI já possui sessão válida; **não foi preciso `supabase login` nem digitar credencial** |
| `npx supabase link --project-ref acqbidvknbqppkjidvsq` | `Target: project supabaseSulsafe (acqbidvknbqppkjidvsq) · production`, `kind: linked` |

O arquivo `.supabase/` e `supabase/config.toml` não foram editados manualmente; o link é estado local da CLI.

## 3. Estado antes do push

`npx supabase migration list --linked` → **17 migrações aplicadas no remoto**, **8 pendentes**, exatamente as da Fase 5:

`20261125000000`, `20261125010000`, `20261125020000`, `20261125030000`, `20261125040000`, `20261125050000`, `20261125060000`, `20261125070000`.

## 4. Comandos executados (ordem real)

| # | Comando | Desfecho |
|---|---|---|
| 1 | `npx supabase link --project-ref acqbidvknbqppkjidvsq` | OK — projeto vinculado |
| 2 | `npx supabase migration list --linked` | OK — 17 aplicadas / 8 pendentes |
| 3 | `echo y \| npx supabase db push` | **Sem efeito remoto.** A CLI 3.4.0 interpretou o alvo como stack local (`127.0.0.1:54322`) e falhou com `ECONNREFUSED`; nenhuma migration foi aplicada. |
| 4 | `echo y \| npx supabase db push --remote` | **Sem efeito.** A CLI recusou em modo agente: `HostedMutationConsentRequiredError` — “Nothing was changed”. |
| 5 | `npx supabase db push --remote --yes` | **Aplicação realizada.** 8 migrações aplicadas em ordem, com `upToDate:false`, `dryRun:false`. |

Saída do push (resumo literal):

```
Applying migration 20261125000000_fase5_fundacao.sql...
Applying migration 20261125010000_fase5_estrutura_prova.sql...
Applying migration 20261125020000_fase5_geracao_prova.sql...
Applying migration 20261125030000_fase5_aprovacao_prova.sql...
Applying migration 20261125040000_fase5_distribuicao_prova.sql...
Applying migration 20261125050000_fase5_realizacao_prova.sql...
Applying migration 20261125060000_etapa3_1_quantidade_questoes.sql...
Applying migration 20261125070000_fase5_painel_professor.sql...
```

Avisos não bloqueantes da CLI: `auth.email.enable_signup` e `auth.sms.enable_signup` estão deprecados em favor de `auth.email.enabled` / `auth.sms.enabled` na v4. Nenhum parâmetro de Auth foi alterado nesta etapa.

## 5. Estado depois do push

`npx supabase migration list --linked` → **25/25 migrações locais com versão remota correspondente**, sem nenhuma pendente. As 8 novas aparecem com horários `2026-11-25 00:00:00` a `2026-11-25 07:00:00`.

## 6. Validação pós-push (somente leitura)

Todas as consultas foram feitas com `npx supabase db query --remote --read-only --output-format json`.

### 6.1 Tabelas novas — 6/6 presentes, RLS ativo

| Tabela | RLS |
|---|---|
| `modulos_direcionados` | ON |
| `provas_distribuicoes` | ON |
| `provas_progresso` | ON |
| `provas_questoes` | ON |
| `provas_respostas_aluno` | ON |
| `provas_revisao_auditoria` | ON |

As três tabelas exigidas na missão — `provas_questoes`, `provas_progresso`, `provas_respostas_aluno` — existem e estão protegidas.

### 6.2 Coluna `quantidade_questoes`

`ia_jobs.quantidade_questoes` existe como `integer`, anulável, sem `DEFAULT` na coluna (o padrão 10 é aplicado pela RPC). Constraint presente:

| Tabela | Constraint | Definição |
|---|---|---|
| `ia_jobs` | `ia_jobs_quantidade_questoes_check` | `CHECK (quantidade_questoes >= 1 AND quantidade_questoes <= 50)` |
| `ia_jobs` | `ia_jobs_tipo_check` | aceita `PROVA` e `MODULO` além dos tipos legados |
| `ia_conteudos` | `ia_conteudos_tipo_check` | aceita `PROVA` e `MODULO` |
| `modulos_direcionados` | `modulos_direcionados_alvo_check` | coerência de `TURMA`/`ALUNO`/demais destinos |

### 6.3 RPCs — 29/29 presentes

Consultadas por `pg_proc` no schema `public`. Todas retornaram `SECURITY DEFINER` e `search_path=""`:

`sulsafe_aprovar_prova_ia`, `sulsafe_carregar_cabecalho_prova_aluno_ia`, `sulsafe_carregar_prova_aluno_ia`, `sulsafe_corrigir_resposta_discursiva_ia`, `sulsafe_criar_ia_job`, `sulsafe_detalhe_resultado_prova_ia`, `sulsafe_distribuir_prova_ia`, `sulsafe_editar_questao_prova_ia`, `sulsafe_listar_destinos_distribuicao_ia`, `sulsafe_listar_gabarito_prova`, `sulsafe_listar_provas_aluno_ia`, `sulsafe_listar_provas_aprovadas_ia`, `sulsafe_listar_provas_pendentes_ia`, `sulsafe_listar_questoes_prova`, `sulsafe_listar_resultados_prova_ia`, `sulsafe_materializar_prova_ia`, `sulsafe_modulos_hitl`, `sulsafe_obter_revisao_prova_ia`, `sulsafe_prova_aluno_valida`, `sulsafe_prova_distribuivel`, `sulsafe_prova_empresa_id`, `sulsafe_prova_entregue_aluno_ia`, `sulsafe_prova_gerenciada`, `sulsafe_prova_revisavel`, `sulsafe_provas_progresso_sync`, `sulsafe_rejeitar_prova_ia`, `sulsafe_salvar_ia_conteudo`, `sulsafe_submeter_prova_aluno_ia`, `sulsafe_turma_herda_empresa`.

Assinaturas conferidas incluem:

- `sulsafe_materializar_prova_ia(p_conteudo_id uuid, p_modo text)` — overload correto da Etapa 3.
- `sulsafe_listar_provas_pendentes_ia()` — sem argumentos.
- `sulsafe_criar_ia_job(..., p_quantidade_questoes integer)` — **6 argumentos**; o overload antigo de 5 argumentos foi removido pela Etapa 3.1, sem duplicidade.

### 6.4 Permissões das RPCs críticas

| RPC | ACL |
|---|---|
| `sulsafe_criar_ia_job` | `postgres`, `service_role`, `authenticated` (sem `anon`, sem `public`) |
| `sulsafe_listar_provas_pendentes_ia` | idem |
| `sulsafe_materializar_prova_ia` | idem |
| `sulsafe_listar_resultados_prova_ia` | idem |

Nenhuma chave de serviço foi usada nas consultas; a sessão foi estabelecida pela CLI autenticada.

## 7. Critérios de aceite

| Critério | Resultado |
|---|---|
| Migrações aplicadas com sucesso no remoto | ✅ 8/8 |
| Nenhum erro de sintaxe ou conflito de tabela | ✅ nenhum |
| Tabelas `provas_questoes`, `provas_progresso`, `provas_respostas_aluno` | ✅ presentes, RLS ON |
| Coluna `quantidade_questoes` | ✅ presente em `ia_jobs`, com CHECK 1..50 |
| RPCs disponíveis | ✅ 29/29, `SECURITY DEFINER`, `search_path=""` |
| Relatório do status remoto | ✅ este documento |
| Nenhum push ao GitHub | ✅ não executado |
| Nenhum deploy de Edge Function / Vercel | ✅ não executado |

## 8. Fora do escopo / próximos passos (dependem de nova autorização)

- `npx supabase functions deploy tutor-sulsafe` — a Edge Function ainda não foi atualizada; o banco já espera o dispatcher `PROVA`/`MODULO` e o parâmetro `quantidade_questoes`.
- Push do código ao GitHub e verificação do build na Vercel — **não executados**.
- Smoke ponta a ponta com conta real (distribuir → responder → resultados → CSV) — não executado; o front publicado ainda é o anterior.
- Backup: não foi feita conferência explícita no painel (Database → Backups) nesta sessão. As 8 migrações são aditivas ou `CREATE OR REPLACE` — nenhuma tabela foi descartada e nenhum dado foi apagado —, mas a verificação de backup deve ser feita antes da próxima mudança remota.
- Se alguma correção for necessária no banco: **nova migration forward-only**, nunca edição de migration aplicada e nunca `db reset`/`truncate` no remoto.

>Estado final do banco remoto: **Fase 5 aplicada e validada**. Estado final do código publicado: **inalterado** (front, Edge Functions e GitHub seguem no commit homologado `2d929cf`).
