# GUIA_DO_PROFESSOR.md — provas I.A. na SulSafe

**Público:** ADMIN e PROFESSOR · **Atualizado em:** 25/11/2026  
**Base:** fluxo de provas I.A. da Fase 5.3 em produção. O uso diário não exige comando, migration ou deploy.

---

## Antes de começar

- Acesse `https://www.sulsafe.com.br` com perfil **ADMIN** ou **PROFESSOR**.
- O **Professor I.A.** precisa estar ativo. Se a tela do Tutor mostrar o aviso *"O Professor I.A. ainda não foi ativado"*, peça a um ADMIN para configurar o provedor em **Modo Deus → PROFESSOR I.A — API**.
- Você enxerga apenas turmas, alunos e provas da sua empresa. A empresa vem do login; não existe campo de empresa para preencher no fluxo.
- Regra de ouro: **a I.A. calcula, o professor decide, o sistema entrega e publica**.

| Ação | O que significa | O que **não** significa |
|---|---|---|
| Gerar | cria um rascunho | publicar ou entregar |
| Aprovar | autoriza seguir para a distribuição | entregar ao aluno |
| Distribuir | cria o vínculo com turma/aluno/catálogo | liberar a nota |
| Liberar Nota | publica a nota no boletim | nada: é o último passo |

O gabarito aparece só nas telas restritas de professor/admin. O aluno nunca recebe gabarito nem nota antes da liberação.

---

## Fluxo 1 — Criar prova com o Tutor-SulSafe

1. No menu lateral, grupo **Acadêmico**, clique em **Criar com o TUTOR-Sulsafe**. O mesmo botão também aparece no topo da Área do Professor.
2. Em **Tipo**, selecione **Prova (múltipla escolha)**.
3. O campo **Quantidade de questões** aparece. Escolha **5**, **10**, **20**, **30** ou **50** — o padrão é 10 e o limite é 50.
4. Em **Assunto**, descreva apenas o tema. Exemplo: *"Crie uma prova com 10 questões sobre NR-10 para equipamentos elétricos e EPI"*.
   - A linha **NRs detectadas: ...** mostra as NRs usadas como contexto. Se nada for detectado, o próprio Tutor escolhe as pertinentes.
5. **Público-alvo (opcional):** informe, por exemplo, *"Colaboradores da obra"*.
6. Clique em **Criar com o TUTOR-Sulsafe**. O botão passa a exibir *"O Tutor está montando..."*.
7. Ao concluir, aparece o aviso **Prova gerada. Revise antes de aprovar.** e o app abre **Área do Professor → Provas da IA**. A prova entra na **Fila de revisão da I.A.** com o selo **Aguardando revisão**.

**Sinal de que deu certo:** a prova aparece na fila de revisão e nenhum aluno foi notificado ainda.

---

## Fluxo 2 — Revisar e aprovar

Acesse **Área do Professor → Provas da IA → Fila de revisão da I.A.**. O mesmo conteúdo também está no menu **Provas Pendentes (IA)**.

1. Localize o card da prova e clique em **Revisar Prova**.
2. Abre o modal **Revisar Prova**, com enunciado, alternativas e **Gabarito** em destaque, incluindo justificativa. Esse gabarito é restrito a professor/admin.
3. Confira NR associada, quantidade de questões e redação. Se precisar corrigir algo, use **Editar Questão** e salve a edição no próprio card.
4. Decida:
   - **Aprovar e Publicar** — a prova fica autorizada para a próxima etapa;
   - **Rejeitar** — preencha **Motivo da rejeição (opcional)** e confirme;
   - **Cancelar** — fecha sem tomar decisão.
5. Aprovada, a prova sai da fila e aparece em **Provas aprovadas — prontas para distribuir**, com o botão **Distribuir Prova**.

> Atenção: **Aprovar e Publicar** não entrega a prova. É apenas a autorização para escolher o destino no Fluxo 3.

**Sinal de que deu certo:** o card aparece em **Provas aprovadas — prontas para distribuir**; se foi rejeitado, ele não pode ser distribuído.

---

## Fluxo 3 — Distribuir para alunos

Em **Provas da IA → Provas aprovadas — prontas para distribuir**, clique em **Distribuir Prova**. O mesmo fluxo está no menu **Distribuir Provas (IA)**.

1. No modal **Distribuir Prova**, em **Destino da prova**, escolha uma opção:

   | Opção | Efeito |
   |---|---|
   | **Turma** (padrão) | Use **Selecionar turma** e escolha a turma da sua empresa |
   | **Aluno** | Use **Selecionar aluno** e escolha um aluno específico |
   | **Catálogo** | Entrega a todos os alunos da empresa |
   | **Rascunho Interno** | Mantém a prova salva, sem entregar a ninguém |

2. Clique em **Confirmar distribuição**.
3. A confirmação aparece como **Prova distribuída e alunos notificados.** — ou **Prova mantida como rascunho interno.**, se você escolheu essa opção.
4. O card passa a exibir **Distribuída** e o botão **Ver Resultados** é habilitado.

**Regras do destino:** a distribuição é única. Depois de distribuída, o botão vira **Já distribuída** e o destino não pode ser trocado. Apenas **Rascunho Interno** pode ser distribuído depois.

**Sinal de que deu certo:** os alunos destinatários recebem a notificação de prova disponibilizada e o botão **Ver Resultados** fica ativo.

---

## Fluxo 4 — Acompanhar e liberar a nota

### 4.1 Onde o aviso aparece

Quando o aluno finaliza a prova, o **sino** do professor/admin mostra:

> **Prova I.A. finalizada**  
> *[aluno] finalizou a prova [título]. Aguarda revisão para liberação da nota.*

Clique no item para abrir **Resultados da Prova**. O mesmo painel está no menu **Resultados de Provas (IA)** e no botão **Ver Resultados** do Fluxo 3.

Até a liberação, o aluno vê apenas:

> `Prova enviada! Aguarde a revisão do professor para ver sua nota.`

### 4.2 Revisar e publicar

1. Na tabela, use **Apenas Pendentes** se quiser ver só quem aguarda decisão. As colunas são **Nome**, **Status**, **Nota**, **Data de Conclusão** e **Ações**.
2. Clique em **Ver Detalhes** na linha do aluno.
3. No modal **Detalhe da Prova**, confira **Nota calculada pela I.A.** e **Conclusão**. O modal mostra a resposta do aluno, o gabarito e a justificativa de cada questão.
4. Se houver questões discursivas, o botão **Corrigir Discursivas** fica habilitado. Preencha **Nota manual (0 a peso da questão)** e:
   - clique em **Corrigir Discursivas** para salvar e conferir a nota recalculada; **ou**
   - clique direto em **Liberar Nota** — ele salva as correções pendentes antes de publicar.
5. Ajuste, se necessário, **Nota final a liberar (0 a 10) — ajuste se necessário**. Se você não alterar o campo, o sistema usa a nota vigente já recalculada.
6. Clique em **Liberar Nota**. A confirmação é:

   > **Nota liberada e publicada no boletim do aluno.**

### 4.3 O que muda para o aluno

- O sino do aluno mostra **Nota liberada** com o valor da nota; ao clicar, abre **Meu Boletim**.
- Antes desse passo, a nota fica invisível para o aluno mesmo já calculada pela I.A.

### 4.4 Confirmar no painel do professor

Em **Área do Professor → Progresso dos Alunos**, use os filtros **Turma** e **Aluno**. A coluna **Provas** mostra o ciclo:

| Momento | Status exibido |
|---|---|
| Sem prova distribuída/realizada | **SEM PROVA** |
| Prova enviada, aguardando decisão | **AGUARDANDO REVISÃO** |
| Nota publicada | **NOTA LIBERADA** |

O painel também mostra **Aulas**, **Progresso** e **Último acesso**. Se quiser um arquivo para conferência posterior, use **Exportar Resultados** na tela de resultados — o CSV gerado respeita a mesma consulta autorizada da tela.

**Sinal de que deu certo:** o status muda para **NOTA LIBERADA** e o aluno vê a nota no boletim.

---

## Checklist rápido

| Etapa | Sinal de sucesso | Se não aparecer |
|---|---|---|
| Gerar | Aviso *Prova gerada...* e card na fila | Verifique se o Professor I.A. está ativo |
| Aprovar | Card em *Provas aprovadas — prontas para distribuir* | Confira se a prova não foi rejeitada |
| Distribuir | *Prova distribuída e alunos notificados.* | Confira se a aprovação foi concluída |
| Liberar | *Nota liberada e publicada no boletim do aluno.* | Confira se a nota final foi informada |

## Não faça

- Não tente entregar a prova antes de aprová-la.
- Não mostre gabarito ao aluno.
- Não considere a nota da I.A. como definitiva antes de **Liberar Nota**.
- Não use os registros do smoke da Fase 5.3 como conteúdo real; a remoção está registrada como dívida técnica em `ROADMAP_SULSAFE.md`.

## Referências

- `ROADMAP_SULSAFE.md` — governança, Fase 5 e dívida técnica.
- `RELATORIO_DEPLOY_FASE5_3.md` — evidências do smoke em produção.
- `RELATORIO_ENTREGAS_DOCUMENTACAO_FASE5_3.md` — status desta entrega de documentação.
