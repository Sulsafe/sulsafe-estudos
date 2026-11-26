# RELATORIO_FINAL_FASE5_2.md — Fase 5.2 em produção (25/11/2026)

## 1. Escopo e resultado

Publicação da Fase 5.2 em `https://www.sulsafe.com.br`, com migration remota, commit/push, build da Vercel e smoke com **palestra real** (sem mock).

**Resultado: CONCLUÍDO.** Todos os gates locais passaram, o deploy está `Ready`, e o fluxo Admin → palestra aprovada/distribuída → Aluno → dashboard/notificação foi validado em produção.

Não houve troca de chaves, API, `vercel.json`, variáveis de ambiente nem alteração de código após o push. As únicas mutações em produção foram dados de homologação e o ajuste de `app_metadata.empresa_id` nas duas contas de teste, autorizado pelo operador.

---

## 2. Migration remota

| Item | Evidência |
|---|---|
| Migration aplicada | `supabase/migrations/20261125100000_fase5_2_palestras.sql` |
| Comando | `npx supabase db push --remote --yes` → `Applying migration 20261125100000_fase5_2_palestras.sql...` / `Finished supabase db push.` |
| `supabase migration list --remote` | `20261125100000` passou a constar em `remote` |
| Projeto | `supabaseSulsafe` / `acqbidvknbqppkjidvsq` / `production` / `ACTIVE_HEALTHY` |
| Observação | `20261125070000_fase5_painel_professor.sql` já estava aplicada; não foi reaplicada |

Tabelas e RPCs confirmadas no remoto:

- Tabelas: `public.palestras`, `public.palestras_distribuicoes` (colunas conferidas via `information_schema.columns`).
- RPCs: `sulsafe_criar_palestra`, `sulsafe_criar_palestra_ia`, `sulsafe_aprovar_palestra`, `sulsafe_distribuir_palestra`, `sulsafe_listar_palestras_professor`, `sulsafe_listar_palestras_aluno`.

---

## 3. Commit, push e build

| Item | Evidência |
|---|---|
| Commit | `ccaf5fc72775413a3edf115143c87147b5e233a6` |
| Mensagem exata | `feat(5.2): unifica area do professor, adiciona palestras e melhora dashboard do aluno` |
| Push | `77fca8f..ccaf5fc main -> main` |
| `git ls-remote origin refs/heads/main` | `ccaf5fc72775413a3edf115143c87147b5e233a6` |
| Clone oficial | `## main...origin/main` (limpo) |
| GitHub (painel) | `main` → latest commit `ccaf5fc` com a mensagem acima |
| Gates locais | `node --test tests/fase5-etapa5-2.test.mjs` 17/17; `npm test` 298/298; `npm run check` 48 arquivos / 0 problemas |

Deploy Vercel (scope `sulsafe-treinamentos-dbc53591`, projeto `sulsafe-estudos-4ppk`):

| Item | Evidência |
|---|---|
| Deployment | `dpl_5r3RGJWwba6C9jugkzkUCFNTZ7Xc` |
| URL | `https://sulsafe-estudos-4ppk-jfwxn85te-sulsafe-treinamentos-dbc53591.vercel.app` |
| Status / target | `READY` / `production`, criado em 25/11/2026 20:51:42 BRT |
| Duração | build 7s, post-build 8s |
| Alias | `www.sulsafe.com.br` (domínio de produção respondeu HTTP 200) |
| Conteúdo novo em produção | `GET /js/views/palestras-professor.js` 200 com handlers não acumulativos (`modal.onsubmit`); `GET /js/dashboard-aluno-core.js` 200 contendo “Palestras Disponíveis” |

---

## 4. Ajuste nas contas de teste

Para o smoke real, as duas contas de homologação passaram a ter `app_metadata.empresa_id = 9b1dc8db-dc1b-4109-9071-5423346de35e` em `auth.users` (Admin `704702d9-…` e Aluno `b4961d4d-…`). Antes do ajuste, `sulsafe_empresa_id()` retornava `null` e a criação de palestra falhava com `P0001 / Empresa não identificada`.

- Os JWTs foram renovados por login no navegador; as sessões passaram a reportar o claim correto.
- Uma tentativa de senha temporária foi integralmente revertida: o hash original foi restaurado e a tabela auxiliar removida. Nenhuma credencial foi gravada em arquivo ou neste relatório.
- O claim permanece apenas nas duas contas de teste; não foi aplicado a nenhuma conta real. Para reverter, basta remover `empresa_id` do `raw_app_meta_data` dessas duas contas (isso fará as palestras de teste deixarem de aparecer para o aluno de teste).

---

## 5. Smoke real — Admin

Executado em `https://www.sulsafe.com.br`, com sessão Admin recém-autenticada:

- `sulsafe_is_admin()` → `true`; `sulsafe_empresa_id()` → `9b1dc8db-dc1b-4109-9071-5423346de35e`.
- Menu **Área do Professor** abierto; abas presentes: `Videoaulas`, `Materiais`, `Salas ao Vivo`, `Turmas/Trilhas`, `Provas`, **`Provas da IA`**, **`Palestras`**.
- Aba **Palestras**: formulário `formPalestraManual` criou a palestra pela UI:
  - id `4f2bf61e-6ec6-4378-bfc3-f699c7dc2146`
  - título `UAT 5.2 producao — Palestra real NR-10`
  - origem `MANUAL`, duração 20 min, roteiro `[{"bloco":"Desenvolvimento","minutos":20,"conteudo":"NR-10"}]`
  - toast: `Palestra salva. Revise e aprove antes de distribuir.`
- Botão **Aprovar Palestra** pela UI → toast `Palestra aprovada — pronta para distribuir.`; estado persistido: `aprovado = true`, `publicado = true`, `destino_tipo` ainda não definido neste ponto (aprovação não entrega nada).
- **Distribuição**: o dropdown “Selecionar aluno” da UI estava vazio porque não há turmas em produção (`sulsafe_listar_destinos_distribuicao_ia()` retornou `{"alunos":[],"turmas":[]}`). A distribuição foi feita diretamente pela RPC de produção `sulsafe_distribuir_palestra(p_palestra_id, 'ALUNO', <aluno de teste>)`:
  - retorno `1`; `sulsafe_acessa_aluno()` → `true`.
  - estado persistido: `aprovado = true`, `publicado = true`, `destino_tipo = ALUNO`, `distribuido_em = 2026-11-26T00:05:26.715587+00:00`.
- Console do navegador: nenhum erro nesta sequência.

---

## 6. Smoke real — Aluno

Sessão do aluno de teste relogada para gerar JWT com o claim de empresa:

- `sulsafe_listar_palestras_aluno()` → `1` palestra: `UAT 5.2 producao — Palestra real NR-10`.
- `/aluno/dashboard`: seção **Palestras Disponíveis** exibiu o card da palestra real com a descrição `Smoke pos-deploy com dados reais, sem mock.`
- Notificações:
  - badge `1` (não lidas);
  - `Nova palestra disponível` — `Palestra "UAT 5.2 producao — Palestra real NR-10" disponível no seu painel.` (uma única entrada);
  - `Novo Material` — `Novo material disponível: "UAT 5.2 — Material NR-10 notificação" na NR 10` (uma única entrada, aspas renderizadas corretamente — sem duplo escape).
- Console do navegador: nenhum erro.

Conferência SQL (estado final):

| Verificação | Valor |
|---|---|
| Palestras em `public.palestras` | 1 |
| Vínculos em `palestras_distribuicoes` para esta palestra/aluno | 1 |
| Notificações `Nova palestra disponível` para o aluno | 1 |
| Notificações `Novo Material` para o aluno | 1 |

---

## 7. Evidências de erro transitório (já explicadas)

- `P0001 / Empresa não identificada` e `Somente administradores e professores podem criar palestras` ocorreram porque duas abas do mesmo domínio compartilham `localStorage`: ao abrir a aba do Aluno, o token dela sobrescreveu o do Admin. Resolvido executando cada fase com a sessão correta em uma única aba.
- `Invalid Refresh Token: Already Used` ocorreu ao tentar renovar um JWT antigo do Aluno. Resolvido com login fresco; o hash temporário usado na tentativa foi restaurado.

Não há pendências funcionais para a Fase 5.2.
