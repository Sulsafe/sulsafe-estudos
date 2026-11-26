-- ============================================================
-- FASE 5.3 — BACKFALL DO GATE HITL (DADOS JÁ EXIBIDOS)
-- ============================================================
-- Migration separada da DDL (migrations são forward-only).
--
-- Os registros CONCLUIDA anteriores a esta mudança já tiveram a nota
-- exibida ao aluno pelo fluxo antigo. Para não esconder retroativamente
-- uma nota que o aluno já recebeu, eles são marecados como liberados e
-- recebem nota_ia = nota. Submissões novas começam com liberado = false.
-- ============================================================

update public.provas_progresso
   set liberado = true,
       nota_ia = coalesce(nota_ia, nota),
       liberado_em = coalesce(liberado_em, now())
 where status = 'CONCLUIDA'
   and liberado = false;

-- Publica no boletim somente provas já liberadas e ainda sem registro de
-- origem, sem sobrescrever notas lançadas manualmente pelo professor.

insert into public.notas
    (usuario_id, nr_id, nota, obs, professor_id, origem_chave, criado_em)
select pr.aluno_id,
       coalesce(pd.nr_id, 0),
       pr.nota,
       format('Nota liberada da prova I.A. %s', coalesce(pd.titulo, 'I.A.')),
       pr.liberado_por,
       format('PROVA_IA:%s:%s', pr.prova_id, pr.aluno_id),
       coalesce(pr.liberado_em, now())
  from public.provas_progresso pr
  join public.provas_direcionadas pd on pd.id = pr.prova_id
 where pr.liberado
   and pr.nota is not null
   and not exists (
       select 1
         from public.notas n
        where n.origem_chave = format('PROVA_IA:%s:%s', pr.prova_id, pr.aluno_id)
   )
on conflict (origem_chave) where origem_chave is not null do nothing;
