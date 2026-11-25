# Relatório — Fase 5, Etapa 7/8: Painel de acompanhamento do professor

**Data:** 25/11/2026
**Status:** CONCLUÍDA, somente local. Nenhuma migration aplicada ao Supabase remoto, nenhum deploy na Vercel, nenhum commit/push.

## 1. Objetivo

Entregar ao professor/admin o acompanhamento das provas distribuídas: quem recebeu, status, nota e data de conclusão; detalhe por aluno com respostas e gabarito; e correção manual de questões discursivas. Etapas 6/8 e 3.1 homologadas foram preservadas.

## 2. TDD

Suíte `tests/fase5-painel-professor.test.mjs` escrita **antes** do código de produção e confirmada em vermelho (7 testes, 7 falhas). Após a implementação: **7/7 verdes**.

| Teste | Cobertura |
|---|---|
| migration da Etapa 7 é forward-only, SECURITY DEFINER e protege gabarito/RLS | migration nova, sem `drop table`/`truncate`, RLS, grants e ausência de gabarito na listagem |
| rotas de resultado usam JWT do professor, chave anônima, whitelist e no-store | 401/405, `Bearer ${token}`, `SUPABASE_ANON_KEY`, whitelist de campos, `Cache-Control: no-store` |
| painel traz tabela, filtro por status, detalhes e correção desabilitada sem discursiva | colunas Nome/Status/Nota/Data de Conclusão, "Apenas Pendentes", modal acessível, botão desabilitado |
| professor da Empresa A não vê resultados da Empresa B (RLS) | listagem vazia e detalhe/correção bloqueados entre empresas |
| listagem devolve nota correta e detalhe entrega gabarito somente ao professor | `PENDENTE`/`EM_ANDAMENTO`/`CONCLUIDA`, nota e gabarito via RPC autorizada |
| correção manual de discursiva recalcula nota e fica restrita à empresa | nota manual, conclusão quando todas as discursivas são corrigidas, auditoria `CORRIGIDO_MANUAL` |
| submissão salva respostas e mantém discursiva em EM_ANDAMENTO | persistência das respostas, nota parcial das objetivas e status pendente de correção |

A suíte foi registrada em `package.json` (`npm test`).

## 3. Banco — `supabase/migrations/20261125070000_fase5_painel_professor.sql`

Migration **nova e forward-only**; nenhuma migration já aplicada foi editada.

- `provas_questoes.tipo` com `DEFAULT 'OBJETIVA'` e `CHECK (OBJETIVA, DISCURSIVA)`.
- `provas_respostas_aluno`: uma linha por (prova, aluno, questão), com `alternativa`, `texto_resposta`, `nota_manual`, `corrigido_por`/`corrigido_em` e chave única. RLS habilitada: leitura para o próprio aluno ou professor/admin da empresa da prova; **toda escrita via RPC**.
- CHECK de `provas_revisao_auditoria.acao` ampliado para incluir `CORRIGIDO_MANUAL` (mesmo padrão de recriação da CHECK usado anteriormente).
- RPCs `SECURITY DEFINER`, `search_path = ''`, `revoke ... from public, anon`, `grant execute ... to authenticated`:
  - `sulsafe_listar_resultados_prova_ia(p_prova_id)`: usa `sulsafe_prova_gerenciada`, devolve aluno, status, nota, conclusão e `possui_discursiva`; **sem gabarito/justificativa**.
  - `sulsafe_detalhe_resultado_prova_ia(p_prova_id, p_aluno_id)`: exige vínculo de entrega e autorização de empresa/papel; devolve respostas, nota e gabarito.
  - `sulsafe_corrigir_resposta_discursiva_ia(p_prova_id, p_aluno_id, p_questao_id, p_nota)`: valida tipo/peso, grava nota manual, recalcula a nota final, conclui quando todas as discursivas foram corrigidas e audita `CORRIGIDO_MANUAL`.
  - `sulsafe_submeter_prova_aluno_ia(uuid, jsonb)`: estendida para aceitar `texto_resposta`, persistir respostas e manter provas com discursiva em `EM_ANDAMENTO` até a correção. **Provas só objetivas continuam idênticas à Etapa 6** (nota automática + `CONCLUIDA`).
  - `sulsafe_carregar_prova_aluno_ia(uuid)`: acrescenta apenas `tipo` ao retorno para o aluno saber qual campo preencher; gabarito/justificativa seguem sem grant. Postgres exige `DROP FUNCTION` desta assinatura para mudar o tipo de retorno — feito dentro da migration nova e seguido de recriação com os mesmos grants.

## 4. Rotas HTTP

- `GET /api/tutor/provas/:id/resultados`
- `GET /api/tutor/provas/:id/resultados/:alunoId`
- `POST /api/tutor/provas/:id/resultados/:alunoId/corrigir`

Todas com JWT do chamador + `SUPABASE_ANON_KEY` servidor, whitelist de campos, `Cache-Control: no-store`, validação de UUID, `OPTIONS`/401/403/400/405/502. **Nenhuma usa chave de serviço.** `POST /api/aluno/provas/:id/submeter` passou a aceitar `texto_resposta` sem quebrar as chamadas antigas.

## 5. Frontend

- `js/views/provas-resultados-ia.js`: tabela Nome/Status/Nota/Data de Conclusão, filtro **Apenas Pendentes**, **Ver Detalhes**, **Corrigir Discursivas** (desabilitado quando a prova não tem discursivas), modal com `role="dialog"`/`aria-modal="true"`, gabarito/referência e campos de nota.
- Botão **Ver Resultados** em `js/views/provas-distribuicao-ia.js` (habilitado apenas para provas já distribuídas).
- `js/views/prova-aluno-ia.js`: questão discursiva renderiza `<textarea>`; envio manda `texto_resposta`; mensagens de confirmação/resultado distinguem nota parcial e correção pendente.
- Helpers `sbListarResultadosProvaIA`, `sbCarregarDetalheResultadoIA`, `sbCorrigirRespostaDiscursivaIA` em `js/supabase-client.js`.
- Registro da view/rota `/admin/provas-resultados` em `js/main.js`, item de menu em `js/app.js` e rewrite em `vercel.json`.

## 6. Verificação

- `node --test tests/fase5-painel-professor.test.mjs` → **7/7**.
- `node --test tests/fase5-realizacao-prova.test.mjs` → **9/9** (Etapa 6 preservada).
- `npm test` → **276/276 testes verdes** (269 anteriores + 7 novos).
- `npm run check` → **43 arquivos, 0 problemas**.
- **Navegador:** painel carregado em harness local isolado (servidor temporário fora do repositório, cliente Supabase mockado; nada deployado). Confirmado: 3 linhas com colunas corretas, filtro reduz para 1 aluno pendente, modal `role="dialog"` com gabarito/justificativa/referência e campo de nota, botão de correção desabilitado na linha sem discursiva, envio de nota gera toast "Correção registrada com sucesso." e recarrega a tabela. **0 erros de console.**

> A verificação no navegador usou dados simulados porque não há credenciais de login no ambiente e nada foi publicado. A validação com conta real depende de autorização para aplicar a migration e deployar — fora do escopo desta etapa.

## 7. Fora do escopo / pendente

- Aplicar `20261125070000_fase5_painel_professor.sql` ao Supabase remoto e publicar o front **somente com autorização explícita** (Etapa 8).
- Nada foi comitado, enviado ao GitHub, deployado ou alterado no remoto.
