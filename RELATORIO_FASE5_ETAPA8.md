# Relatório — Fase 5, Etapa 8/8: exportação CSV e preparação do deploy

**Data:** 25/11/2026
**Status:** CONCLUÍDA, somente local. **Atualização em 25/11/2026:** as migrações da Fase 5 foram aplicadas ao Supabase remoto em autorização separada (`RELATORIO_DEPLOY_FASE1_MIGRACOES.md`). Continuam **não executados** o deploy na Vercel, a publicação de Edge Function e o commit/push ao GitHub (a pasta não é um repo Git ativo).

## 1. Objetivo

Entregar a exportação dos resultados da prova em CSV no painel do professor e deixar documentado, sem executar, o caminho de deploy remoto da Fase 5. Nenhuma migration ou rotas novas foram criadas nesta etapa; o único código de tela alterado foi o painel da Etapa 7, para ligar o botão de exportação.

## 2. TDD

Nova suíte `tests/fase5-etapa8-exportacao.test.mjs`, registrada em `package.json` (`npm test`).

| Teste | Cobertura |
|---|---|
| painel da Etapa 7 ganha botão Exportar Resultados ligado ao gerador de CSV | presença do botão, handler, chamada ao exportador, `disabled` durante a exportação e módulo `js/exportar-resultados-ia.js` |
| CSV sai com BOM, separador ; e cabeçalhos em português | `\uFEFF`, `Nome;Status;Nota;Data de Conclusão`, nota `7,80`, data `25/11/2026` |
| CSV escapa acentos, aspas, ponto e vírgula e neutraliza fórmulas do Excel | aspas duplicadas, quebra de linha, `=`, `+`, `-`, `@` e tab neutralizados com apóstrofo; nota nula e zero |
| download usa Blob CSV, nome seguro e libera a URL temporária | teste de regressão adicional ao caminho de download: `Blob` com `text/csv;charset=utf-8`, um clique, nome sanitizado e `revokeObjectURL` chamado |
| código publicável não contém chaves de API, tokens ou senhas hardcoded | varredura de `js/`, `api/` e `supabase/functions/`; anon key permitida; nenhum `service_role` no cliente |

**Evidência RED/GREEN:** primeira execução da suíte nova, antes de qualquer código de produção → **4 falhas**: três por implementação ausente e uma por falso positivo no detector de senha literal (`prompt('Digite seu email para recuperar a senha:')`). O detector foi corrigido no próprio teste (âncora de início de linha), sem alterar a regra investigada. Após a implementação: **4/4 verdes**, com o mesmo comando `node --test tests/fase5-etapa8-exportacao.test.mjs`. Um quinto teste de regressão foi acrescentado depois para exercitar o download como ação do usuário; suíte final **5/5 verdes**.

## 3. Exportação em `js/exportar-resultados-ia.js` e no painel

- Botão **Exportar Resultados** em `/admin/provas-resultados`, ao lado do filtro **Apenas Pendentes**.
- A exportação usa `sbListarResultadosProvaIA(provaId)` — a mesma RPC autorizada da Etapa 7 — e **ignora o filtro da tela**: o arquivo contém todos os alunos da prova selecionada.
- `Blob` com `text/csv;charset=utf-8`, `URL.createObjectURL`/`revokeObjectURL` e download por `<a download>`. Nada é enviado para servidor ou serviço externo.
- BOM UTF-8 explícito; CRLF entre linhas; separador `;`; cabeçalhos `Nome;Status;Nota;Data de Conclusão`.
- Nota com duas casas e vírgula decimal (`7,80`, `0,00`); vazia quando não há nota. Data em `dd/mm/AAAA` a partir de UTC, sem fuso local.
- Escape de `"` (`""`), `;`, `\r` e `\n`; valores que começam com `=`, `+`, `-`, `@`, tab ou CR recebem apóstrofo para neutralizar fórmulas no Excel.
- Nome de arquivo previsível: `resultados-prova-<id sanitizado>-<YYYY-MM-DD>.csv`.
- Botão desabilitado durante a consulta, com `finally` para reabilitar; erro passa por `handleError`; lista vazia avisa que não há resultados; sem prova na rota, toast de orientação.

## 4. Documentação de deploy

Criado `PASSO_A_PASSO_DEPLOY.md` com roteiro **não executado**:

1. pré-condição de autorização e dados reais do ambiente (`acqbidvknbqppkjidvsq`, `Sulsafe/sulsafe-estudos`, `sulsafe-estudos-4ppk`, `www.sulsafe.com.br`);
2. gates locais e varredura de segredos;
3. backup e janela de mudança;
4. `npx supabase link --project-ref acqbidvknbqppkjidvsq`, `npx supabase migration list --linked` e `npx supabase db push` com as 8 migrations da Fase 5 listadas em ordem;
5. `npx supabase functions deploy tutor-sulsafe` (sem `TUTOR_SULSAFE_STUB` em produção);
6. clone do repositório oficial, revisão do diff, commit e push em `main` — nunca `--force`;
7. verificação do build na Vercel (`Ready/Production`) e smoke real: distribuição → realização → resultados → CSV legível no Excel, com checagem de isolamento entre empresas;
8. rollback por camada (nova migration forward-only, redeploy da função anterior, promote do deploy anterior, `git revert`).

## 5. Varredura final de segredos

- Suíte automatizada no código publicável (`js/`, `api/`, `supabase/functions/`): **0 achados**, com a anon key explícitamente permitida por ser pública por design.
- Varredura ampliada em **81 arquivos** (mesmas pastas mais arquivos da raiz): **0 achados** de tokens de provedor (`sk-`, `AIza`, `ghp_...`), chave privada, senha literal ou JWT `service_role`.
- Não existe arquivo `.env` na pasta. `service_role` aparece somente via `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` nas Edge Functions e como variável de ambiente em `popular-nrs.mjs`; a chave Gemini permanece referenciada como `vault:sulsafe_ia_chave_global`.

## 6. Gates

| Comando | Resultado |
|---|---|
| `node --test tests/fase5-etapa8-exportacao.test.mjs` | 5/5 verdes |
| `npm test` | **281/281 verdes** (276 anteriores + 5 novos) |
| `npm run check` | **44 arquivos, 0 problemas** (43 anteriores + 1 novo módulo) |

## 7. Fora do escopo / pendente

- Na execução desta etapa nada havia sido publicado. Em autorizações posteriores (25/11/2026), **`supabase db push --remote --yes`** (`RELATORIO_DEPLOY_FASE1_MIGRACOES.md`) e **`supabase functions deploy tutor-sulsafe ... --yes`** (`RELATORIO_DEPLOY_FASE2.md`) foram executados com sucesso, e o código foi enviado ao GitHub no commit `e2198a3`. Deploy na Vercel segue **não executado**.
- Nenhuma conta real de aluno/professor foi usada; a validação ponta a ponta com login real depende da publicação do front (seção 6 do roteiro de deploy).
- Nenhuma migration foi criada ou editada na Etapa 8; as mudanças de código se limitam ao painel da Etapa 7, ao novo exportador, ao teste, ao registro do teste em `package.json` e à documentação/governança.
