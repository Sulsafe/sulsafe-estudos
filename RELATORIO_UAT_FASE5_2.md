# Relatório — UAT visual local: Fase 5, Etapa 5.2

**Data:** 25/11/2026  
**Escopo:** validação visual e interativa local das abas **Provas da IA** / **Palestras** (Admin), notificações/alertas, dashboard do aluno e realização de prova. Somente código local; sem push, deploy, migration remota, alteração de banco ou troca de chaves.

**Credenciais:** usadas exclusivamente na sessão do navegador. Não são registradas neste relatório nem em qualquer arquivo do repositório.

## Ambiente

- Servidor UAT temporário em `127.0.0.1:4173` (Admin) e `127.0.0.1:4174` (Aluno), com handlers `/api/*` reais usando `SUPABASE_URL` e **anon key pública**; **nenhum `service_role`**.
- Supabase remoto (`acqbidvknbqppkjidvsq`) consultado apenas em leitura/autenticação de sessão. Nenhuma mutation remota foi executada.
- **Não há capturas de tela neste ambiente.** A evidência abaixo é baseada em snapshots do DOM, texto renderizado, toasts, console do navegador e respostas HTTP.

## Evidência por fluxo

### 1. Shell, abas e fila HITL (real)

- Login Admin e Aluno concluídos; shell SPA carregada sem erros de console na aba Admin.
- Abas **Provas da IA** e **Palestras** presentes na Área do Professor.
- `GET /api/tutor/provas-pendentes` → **200**, sem erros de console.
- Correção aplicada: `switchProfTab` passou a localizar a aba via `Array.from($$('.tab-b')).find(...)`; o redirect do Tutor agora destaca **Provas da IA** e não interrompe o carregamento da fila.

### 2. Geração e aprovação de prova pelo Tutor (real)

- Primeira geração falhou com validação de saída da I.A.:
  `Saída inválida da I.A.: questoes.2.alternativas.2.texto: Esperado texto, mas recebido valor ausente.; questoes.2.alternativas.2: Campo(s) não permitido(s): D.`
- Retry gerou **UAT NR-10 prova 1: equipamentos elétricos e EPI** (5 questões), registrada como rascunho `IA_TUTOR`.
- Modal **Revisar Prova** exibiu enunciados e gabarito restrito ao professor; clique em **Aprovar e Publicar** concluiu a aprovação.
- Fila após aprovação: **“Nenhuma prova aguardando revisão.”**
- Resultado conferido: `publicado = true`, pronta para distribuir — distribuição continua sendo ato separado.

### 3. Notificações e alertas (real)

- Material criado pelo Admin: **UAT 5.2 — Material NR-10 notificação**.
- Linhas de `notificacoes` confirmadas no remoto: **“Material adicionado”** (Admin) e **“Novo Material”** (Aluno), ambas com `link = 'materiais'`.
- **Bug encontrado e corrigido:** duplo escape na renderização. Correção: `desanitizar()` em `js/utils.js` decodifica um nível antes do `sanitizar()` final em `js/app.js`.
- Dropdown do Aluno após correção:
  `Novo material disponível: "UAT 5.2 — Material NR-10 notificação" na NR 10`, badge `1`, sem `&quot;`, sem erros de console.

### 4. Dashboard do aluno (real + mock controlado)

- Rota `/aluno/dashboard` aberta: cards **Meus Cursos**, **Provas Pendentes** e **Palestras Disponíveis** renderizados.
- Sem entregas, o card exibia “Nenhuma palestra disponível no momento.” e “Nenhuma prova pendente.”
- Com mock de `sulsafe_listar_palestras_aluno`, o card passou a exibir **UAT 5.2 — Palestra da I.A. (mock)** e sua descrição, sem duplicatas e sem erros de console.

### 5. Palestras com mocks (migration 5.2 não aplicada no remoto)

Estado limpo, mock instalado somente na aba Admin sob `window.__mockPalestras`, substituindo `sb.rpc` e preservando a RPC real como fallback:

1. **Criar palestra a partir da I.A.** a partir de rascunho `PALESTRA` aprovado → toast “Palestra da I.A. criada e aguardando sua aprovação.”
2. **Aprovar** → toast “Palestra aprovada — pronta para distribuir.”
3. **Uso Pessoal (`INTERNO`)** → toast “Palestra marcada como Uso Pessoal — nada foi entregue.”; nenhuma entrega e nenhuma notificação criadas.
4. **Distribuir → ALUNO** → toast “Palestra distribuída para 1 aluno(s).”

Evidência final do estado:

- Cartão: `UAT 5.2 — Palestra da I.A. (mock) / Distribuída / Materializada do rascunho aprovado. / Origem: TUTOR-SulSafe / Destino: Aluno / Roteiro`.
- `entregas = 1`, `notificacoes = 1`, ou seja, **uma entrega e uma notificação por distribuição**.
- Toasts: um por ação, **sem duplicatas**. Console sem erros.

**Bug encontrado e corrigido:** `openMdl()` reaproveita `#mdlGlobal`; os `addEventListener` de `click`/`submit` se acumulavam entre aberturas e causavam distribuições/notificações duplicadas (`1 aluno(s)` e `2 aluno(s)` na rodada anterior). Correção aplicada em cinco views: handlers de propriedade (`modal.onclick` / `modal.onsubmit`) substituem o handler anterior. Views afetadas: `palestras-professor.js`, `provas-distribuicao-ia.js`, `provas-pendentes-ia.js`, `prova-aluno-ia.js`, `provas-resultados-ia.js`. Teste de regressão adicionado.

### 6. Realização/submissão de prova

**Bloqueio real registrado (conforme exigido, sem alterar banco):**

- `POST /api/aluno/provas/:id/distribuir` → `400` com
  `{ "error": { "code": "DISTRIBUICAO_INDISPONIVEL", "message": "Não foi possível distribuir a prova. Verifique o destino e a aprovação." } }`
- RPC direta → `P0001` / `Prova não disponível para distribuição nesta conta`.
- `sulsafe_prova_empresa_id(...)` = `null`, `sulsafe_empresa_id()` = `null`, `sulsafe_prova_gerenciada(...)` = `false`.
- Submissão real → `400` / `Somente alunos com prova distribuída podem submeter respostas`; `sulsafe_listar_provas_aluno_ia` → `data: []`.
- Dois erros de console na aba Aluno (`Failed to load resource: 400` e `403 (Forbidden)`) são residuais dessas sondas reais, anteriores ao mock; a aba Admin permaneceu sem erros.

**Validação com mock controlado:**

- Cabeçalho renderizado: SulSafe, **PROVA**, título da avaliação, aluno de teste, data, 30 minutos, nota mínima 6 e 5 questões.
- 5 questões objetivas sem gabarito; 5 alternativas marcadas.
- Modal de confirmação: `role="dialog"`, `aria-modal="true"`, texto “Confirme para enviar 5 respostas. Depois disso a nota será calculada automaticamente.”, botões **Confirmar envio** e **Revisar respostas**.
- Confirmação gerou **1** chamada ao endpoint de submissão com **5** respostas; resultado: **“Prova finalizada / Nota parcial: 3 de 5 pontos. / Acertos: 3 de 5 questões objetivas.”**, botão desabilitado e toast único “Prova finalizada com sucesso.”
- Nenhum novo erro de console durante o fluxo mockado.

## Correções de código nesta UAT

1. `js/utils.js` + `js/app.js` — `desanitizar()` para notificações (duplo escape).
2. `js/views/professor.js` — destaque da aba após redirect do Tutor.
3. Cinco views de modal — handlers não acumulativos (`onclick`/`onsubmit`), evitando ações duplicadas.
4. `tests/fase5-etapa5-2.test.mjs` — dois testes de regressão (destaque da aba; modais não acumulam handlers).

## Gates

| Comando | Resultado |
|---|---|
| `node --test tests/fase5-etapa5-2.test.mjs` | **17/17** passes |
| `npm test` | **298/298** passes |
| `npm run check` (`node auditar-imports.mjs`) | **48 arquivos, 0 problemas reais** |

## Limites e estado de entrega

- A migration `20261125100000_fase5_2_palestras.sql` **não** foi aplicada no Supabase remoto; por isso palestras foram validadas com mocks.
- Distribuição e submissão reais permanecem bloqueadas pelas condições acima; nenhuma tentativa de contornar foi feita no banco.
- **Nenhum** commit, push, deploy, migration remota ou troca de chave. Clone oficial mantido apenas como espelho local, sem publicação.
- Evidência conservada apenas neste relatório (DOM/console/HTTP); nenhuma credencial foi persistida.
