# Relatório — Fase 5.4: Emissão, visualização e validação de certificados

**Data:** 26/11/2026  
**Status:** implementada e validada **localmente**. Nenhuma migration foi aplicada ao Supabase remoto, nenhum deploy foi feito e nenhum commit/push foi realizado.

---

## 1. Objetivo

Fechar o ciclo de certificação da plataforma: emissão controlada pelo professor/admin, consulta pelo aluno, visualização premium para impressão/PDF e validação pública por hash — sem tocar no fluxo de provas da Fase 5.3 e sem reintroduzir dados de teste em produção.

## 2. Decisões tomadas nesta fase

| Ponto | Decisão | Motivo |
|---|---|---|
| Nota mínima | **7,0** | Não existe coluna global de nota mínima; 7 é o valor já usado nos testes e no conteúdo das provas do repositório. |
| Aulas concluídas | **100% das videoaulas publicadas do NR** (`publico = true`) | Regra determinística, auditável e independente de turma. |
| Identidade do certificado | `usuario_id` (aluno) + `nr_id` (curso) + `hash_validacao` | Aproveita o schema existente (`codigo` como código curto); nenhuma coluna antiga foi removida. |
| Emissão | **somente via RPC `SECURITY DEFINER`** | INSERT direto já é bloqueado por RLS e pelo gatilho `trg_certificados_protege`. |
| Idempotência | um certificado ativo por par aluno/NR | Evita duplicatas; emissão repetida devolve o registro existente com `ja_existia = true`. |
| Validação pública | RPC devolve **somente** curso, NR, data e código | Nenhum nome, CPF, e-mail ou foto é exposto a terceiros (LGPD). |

## 3. Backend — `supabase/migrations/20261126000000_fase5_4_certificados.sql`

Migration **forward-only e idempotente**, sem comandos destrutivos:

- `create table if not exists public.certificados` compatível com o schema atual.
- Colunas acrescentadas: `empresa_id`, `nota_final`, `hash_validacao`, `emitido_em`; índice único parcial do hash e índice de consulta `(usuario_id, nr_id)`.
- Backfill dos certificados legados (quando existirem) a partir de `codigo`, `nota` e `criado_em`.
- `sulsafe_emitir_certificado(p_aluno_id, p_nr_id, p_nota)`:
  - exige conta ativa, `sulsafe_is_professor()` e `sulsafe_acessa_aluno()`;
  - valida NR 1–38 e perfil de aluno;
  - exige todas as aulas publicadas concluídas e nota ≥ 7;
  - gera hash `sha256` com `now()` + `gen_random_uuid()`;
  - grava `emitido_por = auth.uid()` e `empresa_id` do JWT;
  - `revoke ... from public, anon` e `grant ... to authenticated, service_role`.
- `sulsafe_listar_elegibilidade_certificados()`: devolve ao professor/admin nota, aulas concluídas/total, `apto`, certificado existente e revogação — respeitando o escopo de empresa.
- `sulsafe_validar_certificado_publico(p_hash)`: consulta anônima, sem dados pessoais; `valido = false` para hash inexistente ou revogado.

## 4. Frontend

| Área | Entrega |
|---|---|
| Admin/Professor | Coluna **Certificado** em “Progresso dos Alunos”; botão **Emitir Certificado** habilitado apenas para alunos aptos, com seletor de NR, toast de sucesso e refresh. |
| Dossiê do aluno | Seção **Certificados Emitidos**, com curso, data e atalho para a área do aluno. |
| Dashboard do aluno | Card **Meus Certificados** com atalho `/aluno/certificados`. |
| Área do aluno | Rota `/aluno/certificados` (`aluno-certificados`), lista somente certificados emitidos e não revogados, com **Visualizar Certificado**. |
| Visualização | Documento premium em janela própria: logo SulSafe, aluno, curso, nota final, carga horária, data, hash e link de validação; `window.print()` para salvar/imprimir. |
| Validação pública | `/validar.html` e deep link `/validar/:hash`, com formulário e resultado renderizado via `textContent`. |
| Cliente | `sbEmitirCertificadoRPC`, `sbListarElegibilidadeCertificados` e `sbValidarCertificadoPublico` em `js/supabase-client.js`. O Insert direto legado `sbEmitirCertificado` permanece, mas não é mais o caminho da UI. |

## 5. TDD e gates

- **6 testes novos** em `tests/fase5-4-certificados.test.mjs` (PGlite + asserções de contrato de código):
  1. migration cria RPC com hash e colunas compatíveis;
  2. emissão exige aulas e nota, grava emissor/empresa e não duplica;
  3. aluno não emite manualmente e não vê certificado de outro aluno;
  4. elegibilidade marca apto somente quem concluiu e tem nota;
  5. validação pública informa curso/data sem expor nome ou CPF;
  6. frontend: emissão no progresso, card, dossiê e validação pública.
- `npm test` → **313/313 verdes**.
- `npm run check` → **52 arquivos, 0 problemas**.

## 6. Arquivos entregues

- `supabase/migrations/20261126000000_fase5_4_certificados.sql` (novo)
- `tests/fase5-4-certificados.test.mjs` (novo) e `package.json`
- `js/supabase-client.js`, `js/views/progresso-alunos.js`, `js/dashboard-aluno-core.js`
- `js/views/aluno-dashboard.js`, `js/views/certificados-aluno.js` (novo)
- `js/main.js`, `js/app.js`, `js/views/dossie.js`, `js/views/certificados.js`
- `js/validar-certificado.js` (novo), `validar.html` (novo), `vercel.json`

## 7. O que **não** foi feito

- Migration **não** aplicada em produção; banco remoto permanece como após a limpeza da Fase 5.3.
- Nenhum deploy na Vercel, nenhum commit e nenhum push.
- Nenhum registro de teste criado em produção.
- Fluxo de provas (Fase 5.3) intacto: nenhuma RPC, tabela ou tela de prova foi alterada.

## 8. Próximos passos (somente com autorização explícita)

1. Aplicar `20261126000000_fase5_4_certificados.sql` ao projeto remoto e conferir `migration list`.
2. Publicar o estático na Vercel e validar os deep links `/aluno/certificados` e `/validar/:hash`.
3. Smoke controlado com um aluno apto real: emitir → visualizar → imprimir → validar publicamente → revogar.
4. Somente após o smoke, registrar commit/push com o relatório.
