-- ============================================================
-- FASE 5.4 — EMISSÃO E VALIDAÇÃO DE CERTIFICADOS
-- ============================================================
-- Pre-requisitos: schema-base, 20261023000000, 20261024001000,
-- 20261025000002, 20261125110000 (Fase 5.3).
--
-- A tabela public.certificados já existe; esta migration apenas acrescenta
-- colunas compatíveis (aluno_id = usuario_id, curso_id = nr_id,
-- nota_final = nota) e o hash de validação. Nenhuma coluna antiga é
-- removida, nenhum dado é apagado e o fluxo de provas NÃO é alterado.
--
-- Regra de negócio: nota mínima 7,0 e 100% das videoaulas publicadas do NR
-- concluídas. A emissão acontece somente pela RPC, nunca por INSERT direto.
-- Somente local: NÃO aplicar em produção sem autorização explícita.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. ESTRUTURA (DDL idempotente)
-- ------------------------------------------------------------
create table if not exists public.certificados (
    id uuid primary key default gen_random_uuid(),
    usuario_id uuid references public.profiles(id) on delete cascade,
    nr_id integer not null,
    codigo text unique,
    nota numeric(5,2),
    carga_horaria integer not null default 40,
    emitido_por uuid references public.profiles(id),
    criado_em timestamptz not null default now(),
    revogado boolean not null default false
);

alter table public.certificados
    add column if not exists empresa_id uuid,
    add column if not exists nota_final numeric(5,2),
    add column if not exists hash_validacao text,
    add column if not exists emitido_em timestamptz;

-- Certificados antigos continuam válidos pelo código legado.
update public.certificados
   set hash_validacao = coalesce(hash_validacao, codigo),
       nota_final = coalesce(nota_final, nota),
       emitido_em = coalesce(emitido_em, criado_em)
 where hash_validacao is null or nota_final is null or emitido_em is null;

create unique index if not exists certificados_hash_validacao_key
    on public.certificados (hash_validacao)
    where hash_validacao is not null;

create index if not exists certificados_aluno_nr_idx
    on public.certificados (usuario_id, nr_id)
    where revogado is not true;

comment on column public.certificados.hash_validacao is
    'SHA-256 usado na validação pública. Nunca expõe CPF ou nome do aluno.';
comment on column public.certificados.empresa_id is
    'Empresa do emissor, obtida do claim app_metadata.empresa_id do JWT.';

-- ------------------------------------------------------------
-- 2. EMISSÃO — ÚNICO CAMINHO VÁLIDO
-- ------------------------------------------------------------
create or replace function public.sulsafe_emitir_certificado(
    p_aluno_id uuid,
    p_nr_id integer,
    p_nota numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_empresa uuid;
    v_total integer;
    v_concluidas integer;
    v_nota numeric(5,2);
    v_nota_minima numeric(5,2) := 7;
    v_hash text;
    v_cert public.certificados%rowtype;
    v_existente jsonb;
begin
    if not public.sulsafe_conta_ativa()
       or not public.sulsafe_is_professor()
       or not public.sulsafe_acessa_aluno(p_aluno_id) then
        raise exception 'Acesso negado: somente professor/admin pode emitir certificado para aluno de sua empresa.'
            using errcode = '42501';
    end if;

    if p_nr_id is null or p_nr_id < 1 or p_nr_id > 38 then
        raise exception 'Informe um NR válido (1 a 38).' using errcode = '23514';
    end if;

    if not public.sulsafe_perfil_aluno(p_aluno_id) then
        raise exception 'O certificado deve pertencer a um aluno.' using errcode = '23514';
    end if;

    select n.nota into v_nota
      from public.notas n
     where n.usuario_id = p_aluno_id
       and n.nr_id = p_nr_id
     order by n.criado_em desc, n.id desc
     limit 1;

    if p_nota is not null then
        v_nota := p_nota;
    end if;

    select count(*)::integer,
           (count(*) filter (where pr."concluído" is true))::integer
      into v_total, v_concluidas
      from public.videoaulas va
      left join public.progresso_aulas pr
        on pr.aula_id = va.id
       and pr.user_id = p_aluno_id
     where va.nr_id = p_nr_id
       and va.publico is true;

    if v_total = 0 or v_concluidas <> v_total then
        raise exception 'O aluno precisa concluir todas as aulas publicadas deste NR.'
            using errcode = '23514';
    end if;

    if v_nota is null or v_nota < v_nota_minima then
        raise exception 'Nota mínima de % não atingida.', v_nota_minima
            using errcode = '23514';
    end if;

    -- Idempotência: nunca duplica um certificado ativo do mesmo aluno/NR.
    select jsonb_build_object(
               'id', c.id,
               'codigo', c.codigo,
               'hash', c.hash_validacao,
               'aluno_id', c.usuario_id,
               'nr_id', c.nr_id,
               'nota', coalesce(c.nota_final, c.nota),
               'emitido_em', coalesce(c.emitido_em, c.criado_em),
               'ja_existia', true
           )
      into v_existente
      from public.certificados c
     where c.usuario_id = p_aluno_id
       and c.nr_id = p_nr_id
       and c.revogado is not true
     order by c.criado_em desc
     limit 1;

    if v_existente is not null then
        return v_existente;
    end if;

    v_empresa := nullif(auth.jwt() -> 'app_metadata' ->> 'empresa_id', '')::uuid;
    v_hash := encode(
        sha256(convert_to(
            concat(p_aluno_id, ':', p_nr_id, ':', now(), ':', gen_random_uuid()),
            'UTF8'
        )),
        'hex'
    );

    insert into public.certificados (
        usuario_id, empresa_id, nr_id, nota, nota_final,
        codigo, hash_validacao, carga_horaria, emitido_por, emitido_em
    ) values (
        p_aluno_id, v_empresa, p_nr_id, v_nota, v_nota,
        upper(substr(v_hash, 1, 12)), v_hash, 40, auth.uid(), now()
    )
    returning * into v_cert;

    return jsonb_build_object(
        'id', v_cert.id,
        'codigo', v_cert.codigo,
        'hash', v_cert.hash_validacao,
        'aluno_id', v_cert.usuario_id,
        'nr_id', v_cert.nr_id,
        'nota', coalesce(v_cert.nota_final, v_cert.nota),
        'emitido_em', coalesce(v_cert.emitido_em, v_cert.criado_em),
        'ja_existia', false
    );
end;
$$;

revoke all on function public.sulsafe_emitir_certificado(uuid, integer, numeric) from public, anon;
grant execute on function public.sulsafe_emitir_certificado(uuid, integer, numeric) to authenticated, service_role;

comment on function public.sulsafe_emitir_certificado(uuid, integer, numeric) is
    'Emite certificado somente se todas as aulas do NR foram concluídas e a nota é >= 7,0.';

-- ------------------------------------------------------------
-- 3. ELEGIBILIDADE PARA O PAINEL DO PROFESSOR
-- ------------------------------------------------------------
create or replace function public.sulsafe_listar_elegibilidade_certificados()
returns table (
    aluno_id uuid,
    nr_id integer,
    nome_completo text,
    nota numeric,
    nota_minima numeric,
    aulas_concluidas integer,
    aulas_total integer,
    apto boolean,
    certificado_id uuid,
    emitido_em timestamptz,
    revogado boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.sulsafe_conta_ativa()
       or not public.sulsafe_is_professor() then
        return;
    end if;

    return query
    with nrs as (
        select distinct va.nr_id
          from public.videoaulas va
         where va.publico is true
    ), alunos as (
        select p.id, p.nome_completo
          from public.profiles p
         where p.role::text = 'aluno'
           and p.status = 'ativo'
           and public.sulsafe_acessa_aluno(p.id)
    ), dados as (
        select a.id as aluno_id,
               a.nome_completo,
               n.nr_id,
               (
                   select nota.nota
                     from public.notas nota
                    where nota.usuario_id = a.id
                      and nota.nr_id = n.nr_id
                    order by nota.criado_em desc, nota.id desc
                    limit 1
               ) as nota,
               (
                   select count(*)::integer
                     from public.videoaulas va
                     join public.progresso_aulas pr
                       on pr.aula_id = va.id
                      and pr.user_id = a.id
                    where va.nr_id = n.nr_id
                      and va.publico is true
                      and pr."concluído" is true
               ) as aulas_concluidas,
               (
                   select count(*)::integer
                     from public.videoaulas va
                    where va.nr_id = n.nr_id
                      and va.publico is true
               ) as aulas_total
          from alunos a
          cross join nrs n
    )
    select d.aluno_id,
           d.nr_id,
           d.nome_completo,
           d.nota,
           7::numeric as nota_minima,
           d.aulas_concluidas,
           d.aulas_total,
           (d.aulas_total > 0
            and d.aulas_concluidas = d.aulas_total
            and coalesce(d.nota, 0) >= 7) as apto,
           cert.id as certificado_id,
           coalesce(cert.emitido_em, cert.criado_em) as emitido_em,
           coalesce(cert.revogado, false) as revogado
      from dados d
      left join lateral (
          select c.id, c.criado_em, c.emitido_em, c.revogado
            from public.certificados c
           where c.usuario_id = d.aluno_id
             and c.nr_id = d.nr_id
             and c.revogado is not true
           order by c.criado_em desc
           limit 1
      ) cert on true
     order by d.nome_completo, d.nr_id;
end;
$$;

revoke all on function public.sulsafe_listar_elegibilidade_certificados() from public, anon;
grant execute on function public.sulsafe_listar_elegibilidade_certificados() to authenticated, service_role;

-- ------------------------------------------------------------
-- 4. VALIDAÇÃO PÚBLICA — SOMENTE DADOS NÃO PESSOAIS
-- ------------------------------------------------------------
create or replace function public.sulsafe_validar_certificado_publico(p_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_resultado jsonb;
begin
    if p_hash is null or length(btrim(p_hash)) = 0 or length(btrim(p_hash)) > 128 then
        return jsonb_build_object('valido', false);
    end if;

    select jsonb_build_object(
               'valido', true,
               'nr_id', c.nr_id,
               'curso', case
                   when c.nr_id between 1 and 38
                   then format('NR-%s', lpad(c.nr_id::text, 2, '0'))
                   else 'Curso SulSafe'
               end,
               'emitido_em', coalesce(c.emitido_em, c.criado_em),
               'codigo', c.codigo
           )
      into v_resultado
      from public.certificados c
     where c.hash_validacao = btrim(p_hash)
       and c.revogado is not true
     limit 1;

    return coalesce(v_resultado, jsonb_build_object('valido', false));
end;
$$;

revoke all on function public.sulsafe_validar_certificado_publico(text) from public;
grant execute on function public.sulsafe_validar_certificado_publico(text) to anon, authenticated, service_role;

comment on function public.sulsafe_validar_certificado_publico(text) is
    'Consulta pública por hash. Nunca devolve nome, CPF, e-mail ou foto do aluno.';

commit;
