# Relatório — Deploy Fase 3 (smoke em produção)

**Data:** 25/11/2026  
**Ambiente:** Supabase `acqbidvknbqppkjidvsq` (produção) + Vercel `sulsafe-estudos-4ppk` (`https://www.sulsafe.com.br`)  
**Resultado:** **SUCESSO PARCIAL — geração REAL homologada; fluxo HITL completo BLOQUEADO por configuração de produção.**

> Não houve alteração de código, nova migration, novo push ou novo deploy nesta fase. Nenhuma automação de correção foi executada.

---

## 1. O que passou

### 1.1 Código e functions no ar

| Verificação | Evidência |
|---|---|
| Front Fase 5 publicado | `/js/exportar-resultados-ia.js` SHA256 `e49867…` e `/js/tutor-contratos-fase5-core.js` SHA256 `1376ebd…` idênticos ao working tree; `/login.html` bate com `902e969`; `index.html` é comum aos commits. |
| GitHub `main` | `902e96967de581ad71ed2e413db6ed471cb34525` (inclui `e2198a3`). |
| Edge Function | `tutor-sulsafe` **v3 ACTIVE**, `verify_jwt true` (`npx supabase functions deploy … --yes`). |
| Secrets remotos | `TUTOR_SULSAFE_STUB` **ausente** em `npx supabase secrets list --remote --output-format json`. `SUPABASE_SERVICE_ROLE_KEY` existe apenas como segredo de servidor. |

### 1.2 Smoke do fluxo `PROVA` com Admin de teste

Conta criada no Supabase porque não existia Admin de teste separado:
`smoke.fase3@sulsafe.com.br` · `id 9fd31d05-8a57-4f8e-9d64-3b002edcdab4`.

1. Login bem-sucedido; dashboard exibiu **“Olá, Smoke Fase 3 👋”** com os menus de IA disponíveis.
   - O primeiro login falhou com `invalid_credentials` por campos obrigatórios ausentes em `auth.users`; corrigido com `instance_id`, `confirmation_token`, `recovery_token`, `email_change*` e `email_change_confirm_status`. Não recorreu.
2. Job criado pela UI: **“Prova de NR-10”**, `tipo PROVA`, **5 questões**.
3. Edge Function respondeu:
   - `POST /functions/v1/tutor-sulsafe` → **201** em **24.514 ms**
   - `OPTIONS` → **200**
   - request id `e200e108-6e2a-4b41-b9d3-7c67487d0049:87`
   - corpo: `jobId 228ba207-0d2d-433e-9443-5cbf450e1fab`, `jobStatus CONCLUIDO`, `conteudoId 9f2a868a-74d0-4b63-98da-add2ef082c63`, `provaId 60be610d-35dd-4fa2-b8c0-2d2ec6928b9e`, `publicado false`, contrato com 5 questões e gabarito/justificativas reais de NR-10.
4. Materialização confirmada no banco remoto (consultas read-only):

| Tabela | Resultado |
|---|---|
| `ia_jobs` | `status CONCLUIDO`, `quantidade_questoes 5`, `tentativas 1`, `erro_mensagem null`, criado `17:41:45.355386+00`, concluído `17:42:09.862516+00` |
| `ia_conteudos` | `origem TUTOR_SULSAFE`, `tipo PROVA`, `materializado_tipo PROVA`, `qtd_solicitada 5`, `aprovado false` → depois `true`, `publicado false` → depois `true` |
| `provas_direcionadas` | `id 60be610d-35dd-4fa2-b8c0-2d2ec6928b9e`, `titulo “Prova de NR-10”`, `nr_id 10`, `tipo prova`, `origem IA_TUTOR`, `publicado false`, **5 questões** em `provas_questoes` |

5. Aprovação pela UI do Tutor: `aprovado true`, `aprovado_por 9fd31d05-…`, `aprovado_em 17:44:10.759163+00`. O gabarito permaneceu no rascunho e não foi exibido ao aluno.
6. “Publicar para todos” pela UI do Tutor: `ia_conteudos.publicado true`, `publicado_em 17:46:05.821217+00`.
7. Console limpo após reload com a sessão ativa: **0 erros**. Nenhum erro de CORS. Nenhuma ocorrência de `service_role` em HTML, `localStorage`, `sessionStorage`, cookies, URLs ou respostas de rede. A chave **anon** pública aparece no header `apikey`, como esperado.

---

## 2. Bloqueios encontrados em produção (não corrigidos)

### 2.1 Fila HITL indisponível — `/api/tutor/provas-pendentes` → 500

A tela **“Provas Pendentes (IA)”** exibe `API de conteúdo não configurada.` e não carrega a fila de aprovação.

- Request: `GET https://www.sulsafe.com.br/api/tutor/provas-pendentes` → **500**
- ids: `e200e108-6e2a-4b41-b9d3-7c67487d0049:100` e, após reload limpo, `…:193`
- Corpo exato: `{"error":{"code":"CONFIGURACAO_AUSENTE","message":"API de conteúdo não configurada."}}`
- `x-vercel-id: gru1::iad1::lbz5g-1795628853611-a699cee9e657`
- Causa no código: `api/tutor/provas-pendentes.mjs:62-69` exige `process.env.SUPABASE_URL` e `process.env.SUPABASE_ANON_KEY`. Pelo menos uma das duas **não está definida no runtime da Vercel**.

**Consequência:** o caminho correto de aprovação (`sulsafe_aprovar_prova_ia`) não pode ser usado pela UI. A aprovação feita foi a do fluxo legado do Tutor (`sbRevisarRascunhoTutor`), que marca `ia_conteudos.aprovado = true` mas **não** marca `provas_direcionadas.publicado = true`.

Tentativa de regularizar pela RPC correta, com o JWT do Admin de teste:

```
POST /rest/v1/rpc/sulsafe_aprovar_prova_ia
{"p_prova_id":"60be610d-35dd-4fa2-b8c0-2d2ec6928b9e"}
→ HTTP 400  {"code":"P0001","message":"Esta prova já foi aprovada"}
```

A RPC aborta antes de qualquer `UPDATE` (houve apenas a exceção; o estado da prova não foi alterado).

### 2.2 Fila de distribuição e resultados vazias

- **“Distribuir Provas (IA)”**: `Nenhuma prova aprovada aguardando distribuição.`
- **“Resultados de Provas (IA)”**: `Selecione uma prova distribuída para ver os resultados.`
- **“Provas Pendentes (IA)”**: erro 500 acima.

Causa: `sulsafe_listar_provas_aprovadas_ia()` (`20261125040000_fase5_distribuicao_prova.sql:220-238`) e `sulsafe_prova_distribuivel()` (`:162-185`) exigem `pd.publicado = true`. O registro está com `pd.publicado = false` porque a aprovação correta da Etapa 4 não foi aplicada. Além disso, **não há alunos no ambiente** (`profiles`: 2 `admin`, 1 `professor`, 0 `aluno`), então qualquer destino `TURMA`/`ALUNO`/`CATALOGO` falharia com `Nenhum aluno elegível para este destino` mesmo após a correção do item 2.1.

### 2.3 Deep links retornam 404 em produção

Apesar de `vercel.json:5-12` conter os rewrites, todas as URLs diretas testadas retornam **404**:

| URL | Status |
|---|---|
| `/admin/provas-pendentes` | 404 |
| `/admin/provas-distribuicao` | 404 |
| `/admin/provas-resultados` | 404 |
| `/aluno/prova/60be610d-35dd-4fa2-b8c0-2d2ec6928b9e` | 404 |

Corpo exato (exemplo): `The page could not be found\n\nNOT_FOUND\n\ngru1::6qjhr-1795629085776-5e4e25448fa7` · `content-type: text/plain; charset=utf-8` · `x-vercel-id: gru1::6qjhr-1795629085776-5e4e25448fa7`.

A navegação pelo menu lateral funciona normalmente; o problema é apenas o acesso direto/recarrego dessas rotas.

### 2.4 Observação sobre o buffer de console

Os erros **400** (RPC de aprovação) e **404** (deep links) aparecem no console porque foram **provocações intencionais deste smoke** para documentar os bloqueios. Logo após um reload limpo, antes dessas provocações, o console estava com **0 erros** e sem CORS/`service_role`.

---

## 3. Segurança

- `TUTOR_SULSAFE_STUB` ausente nos secrets remotos → modo REAL ativo (confirmado pelo conteúdo real de NR-10 gerado e materializado).
- `SUPABASE_SERVICE_ROLE_KEY` aparece apenas na lista de secrets do servidor Supabase; **nunca** no navegador, em headers, storages ou respostas.
- RPCs críticas seguem `SECURITY DEFINER` com `search_path=""` e sem grants para `anon`/`public` (validação da Fase 1).

---

## 4. Estado final e pedido de decisão

**Homologado:** build/código no ar, migrations, Edge Function `tutor-sulsafe` v3, geração REAL de prova `PROVA` com 5 questões, materialização atômica em `provas_direcionadas` + `provas_questoes`, isolamento e ausência de vazamento de segredos.

**Não homologado:** ciclo HITL completo (fila → aprovação → distribuição → resultados) e deep links.

Para concluir a Fase 3 seria necessário, **com sua autorização**:

1. Definir `SUPABASE_URL` e `SUPABASE_ANON_KEY` no projeto Vercel e republicar (ou corrigir a origem da configuração de rewrites) — sem isso a fila HITL continua 500 e os deep links continuam 404.
2. Decidir como tratar a prova de teste já aprovada pelo caminho legado (ela não pode ser re-aprovada pela RPC da Etapa 4) e se deve existir um aluno de teste para validar distribuição/resultados.

**Nada disso foi feito. Aguardando instruções.**

Arquivo temporário `cria-admin-smoke-fase3.sql` (continha a senha do Admin de teste em plaintext) foi **removido** após o uso.
