-- ============================================================
-- DOSSIÊ SISTEC DO ALUNO
-- ============================================================
-- Prepara o cadastro de alunos para auditorias e para a futura
-- integração com o SISTEC/MEC.
--
-- Esta migration NÃO foi aplicada no Supabase remoto.
-- Antes de aplicar, revise os dados existentes de CPF.
--
-- Referências usadas no desenho:
-- - SISTEC usa CPF como chave principal de identificação.
-- - Dados mínimos de matrícula: nome completo, CPF, forma de
--   acesso, cor/raça, renda per capita, identidade de gênero
--   e tipo de deficiência.
-- - Para alunos sem CPF, o SISTEC exige RG, nome da mãe, data
--   de nascimento e nacionalidade. O dossiê já guarda esses
--   campos para não perder histórico.
-- ============================================================

begin;

-- ============================================================
-- 1. PERFIS: DADOS DO DOSSIÊ
-- ============================================================

alter table public.profiles
    add column if not exists cpf text,
    add column if not exists data_nascimento date,
    add column if not exists cor_raca text,
    add column if not exists renda_per_capita numeric(10, 2),
    add column if not exists identidade_genero text,
    add column if not exists tipo_deficiencia text,
    add column if not exists forma_acesso text,
    add column if not exists nome_mae text,
    add column if not exists nacionalidade text default 'Brasileira',
    add column if not exists sexo text,
    add column if not exists foto_url text,
    add column if not exists dossie_status text not null default 'pendente',
    add column if not exists dossie_observacoes text,
    add column if not exists dossie_aprovado_em timestamptz,
    add column if not exists dossie_aprovado_por uuid references public.profiles(id) on delete set null,
    add column if not exists atualizado_em timestamptz not null default now();

comment on column public.profiles.cpf is
    'CPF sem máscara, usado como chave de identificação no SISTEC.';
comment on column public.profiles.foto_url is
    'Caminho da foto 3x4 no bucket privado documentos-alunos.';
comment on column public.profiles.dossie_status is
    'Situação do dossiê: pendente, aprovado ou rejeitado.';

-- Normaliza CPFs já existentes e detecta duplicidades antes do índice.
update public.profiles
set cpf = nullif(regexp_replace(cpf, '\D', '', 'g'), '')
where cpf is not null;

do $$
begin
    if exists (
        select 1
        from public.profiles
        where cpf is not null
          and cpf !~ '^[0-9]{11}$'
    ) then
        raise exception 'Existem CPFs com formato inválido em profiles. Corrija para 11 dígitos antes de aplicar a migration.';
    end if;

    if exists (
        select 1
        from public.profiles
        where cpf is not null
        group by cpf
        having count(*) > 1
    ) then
        raise exception 'Existem CPFs duplicados em profiles. Corrija os dados antes de criar o índice único.';
    end if;
end $$;

create unique index if not exists profiles_cpf_uidx
    on public.profiles (cpf)
    where cpf is not null;

-- A coluna permanece nullable para não quebrar contas antigas e o
-- fluxo atual de criação de usuário. A obrigatoriedade é aplicada
-- no dossiê e na aprovação. Depois do backfill, execute:
-- alter table public.profiles alter column cpf set not null;

alter table public.profiles
    drop constraint if exists profiles_cpf_formato_check,
    add constraint profiles_cpf_formato_check
        check (cpf is null or cpf ~ '^[0-9]{11}$'),
    drop constraint if exists profiles_renda_per_capita_check,
    add constraint profiles_renda_per_capita_check
        check (renda_per_capita is null or renda_per_capita >= 0),
    drop constraint if exists profiles_dossie_status_check,
    add constraint profiles_dossie_status_check
        check (dossie_status in ('pendente', 'aprovado', 'rejeitado')),
    drop constraint if exists profiles_dossie_aprovado_dados_check,
    add constraint profiles_dossie_aprovado_dados_check
        check (
            dossie_status <> 'aprovado'
            or (
                cpf is not null
                and data_nascimento is not null
                and cor_raca is not null
                and renda_per_capita is not null
                and identidade_genero is not null
                and tipo_deficiencia is not null
                and forma_acesso is not null
                and foto_url is not null
            )
        );

-- Normaliza CPF em qualquer insert/update, inclusive fora da RPC.
create or replace function public.normalizar_cpf_perfil()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.cpf is not null then
        new.cpf := nullif(regexp_replace(new.cpf, '\D', '', 'g'), '');
    end if;
    return new;
end;
$$;

drop trigger if exists trg_profiles_normaliza_cpf on public.profiles;
create trigger trg_profiles_normaliza_cpf
before insert or update of cpf on public.profiles
for each row execute function public.normalizar_cpf_perfil();

-- ============================================================
-- 2. DOCUMENTOS DO ALUNO
-- ============================================================

create table if not exists public.documentos_aluno (
    id uuid primary key default gen_random_uuid(),
    aluno_id uuid not null references public.profiles(id) on delete cascade,
    tipo_documento text not null,
    arquivo_url text not null,
    arquivo_path text,
    nome_arquivo text,
    mime_type text,
    tamanho_bytes bigint,
    status text not null default 'pendente',
    observacao text,
    enviado_em timestamptz not null default now(),
    analisado_em timestamptz,
    analisado_por uuid references public.profiles(id) on delete set null,
    atualizado_em timestamptz not null default now(),
    constraint documentos_aluno_tipo_check check (
        tipo_documento in (
            'FOTO_3X4',
            'RG',
            'CPF',
            'HISTORICO_ESCOLAR',
            'COMPROVANTE_RESIDENCIA',
            'CERTIDAO_NASCIMENTO',
            'RESERVISTA',
            'TITULO_ELEITOR',
            'CNH',
            'OUTRO'
        )
    ),
    constraint documentos_aluno_status_check
        check (status in ('pendente', 'aprovado', 'rejeitado')),
    constraint documentos_aluno_tamanho_check
        check (tamanho_bytes is null or tamanho_bytes > 0),
    constraint documentos_aluno_aluno_tipo_key
        unique (aluno_id, tipo_documento)
);

comment on column public.documentos_aluno.arquivo_url is
    'Caminho do objeto no bucket privado documentos-alunos. A URL assinada é gerada sob demanda.';
comment on column public.documentos_aluno.arquivo_path is
    'Caminho interno do objeto no Storage, usado para gerar URLs assinadas e excluir o arquivo.';

create index if not exists documentos_aluno_aluno_idx
    on public.documentos_aluno (aluno_id);

create index if not exists documentos_aluno_status_idx
    on public.documentos_aluno (status);

-- ============================================================
-- 3. GATILHOS DE ATUALIZAÇÃO E AUDITORIA
-- ============================================================

create or replace function public.sulsafe_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.atualizado_em := now();
    return new;
end;
$$;

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch
before update on public.profiles
for each row execute function public.sulsafe_touch_updated_at();

drop trigger if exists trg_documentos_aluno_touch on public.documentos_aluno;
create trigger trg_documentos_aluno_touch
before update on public.documentos_aluno
for each row execute function public.sulsafe_touch_updated_at();

-- Aluno só pode manter documentos pendentes. Admin pode aprovar,
-- rejeitar ou devolver para pendente. O gatilho também preenche
-- os campos de auditoria.
create or replace function public.documentos_aluno_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.arquivo_url not like new.aluno_id::text || '/%'
       or (new.arquivo_path is not null and new.arquivo_path not like new.aluno_id::text || '/%') then
        raise exception 'Caminho de arquivo inválido para este aluno.' using errcode = '42501';
    end if;

    if tg_op = 'INSERT' then
        if public.sulsafe_is_admin() then
            if new.status in ('aprovado', 'rejeitado') then
                new.analisado_em := now();
                new.analisado_por := auth.uid();
            end if;
        else
            new.status := 'pendente';
            new.analisado_em := null;
            new.analisado_por := null;
        end if;
        return new;
    end if;

    if public.sulsafe_is_admin() then
        if new.status is distinct from old.status then
            if new.status = 'pendente' then
                new.analisado_em := null;
                new.analisado_por := null;
            else
                new.analisado_em := now();
                new.analisado_por := auth.uid();
            end if;
        end if;
    else
        new.aluno_id := old.aluno_id;
        new.status := 'pendente';
        new.enviado_em := now();
        new.analisado_em := null;
        new.analisado_por := null;
    end if;

    return new;
end;
$$;

drop trigger if exists trg_documentos_aluno_auditoria on public.documentos_aluno;
create trigger trg_documentos_aluno_auditoria
before insert or update on public.documentos_aluno
for each row execute function public.documentos_aluno_auditoria();

-- ============================================================
-- 4. RPCS DO DOSSIÊ
-- ============================================================

create or replace function public.atualizar_meu_dossie(
    p_nome_completo text,
    p_cpf text,
    p_data_nascimento date,
    p_cor_raca text,
    p_renda_per_capita numeric,
    p_identidade_genero text,
    p_tipo_deficiencia text,
    p_forma_acesso text,
    p_nome_mae text default null,
    p_nacionalidade text default 'Brasileira',
    p_sexo text default null,
    p_foto_url text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_id uuid := auth.uid();
    v_cpf text;
    v_perfil public.profiles;
begin
    if v_id is null then
        raise exception 'Sessão inválida. Faça login novamente.' using errcode = '42501';
    end if;

    v_cpf := nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');

    if v_cpf is null or v_cpf !~ '^[0-9]{11}$' then
        raise exception 'CPF é obrigatório e deve conter 11 dígitos.' using errcode = '23514';
    end if;

    p_foto_url := nullif(btrim(coalesce(p_foto_url, '')), '');

    if p_foto_url is not null
       and p_foto_url !~ '^https?://'
       and p_foto_url not like v_id::text || '/%' then
        raise exception 'Caminho de foto inválido.' using errcode = '42501';
    end if;

    if p_data_nascimento is null then
        raise exception 'Data de nascimento é obrigatória.' using errcode = '23514';
    end if;

    if p_data_nascimento > current_date then
        raise exception 'Data de nascimento não pode estar no futuro.' using errcode = '23514';
    end if;

    if p_renda_per_capita is null or p_renda_per_capita < 0 then
        raise exception 'Renda per capita inválida.' using errcode = '23514';
    end if;

    if nullif(btrim(coalesce(p_cor_raca, '')), '') is null then
        raise exception 'Cor/raça é obrigatória.' using errcode = '23514';
    end if;

    if nullif(btrim(coalesce(p_identidade_genero, '')), '') is null then
        raise exception 'Identidade de gênero é obrigatória.' using errcode = '23514';
    end if;

    if nullif(btrim(coalesce(p_tipo_deficiencia, '')), '') is null then
        raise exception 'Tipo de deficiência é obrigatório.' using errcode = '23514';
    end if;

    if nullif(btrim(coalesce(p_forma_acesso, '')), '') is null then
        raise exception 'Forma de acesso é obrigatória.' using errcode = '23514';
    end if;

    update public.profiles
    set nome_completo = coalesce(nullif(btrim(p_nome_completo), ''), nome_completo),
        cpf = v_cpf,
        data_nascimento = p_data_nascimento,
        cor_raca = btrim(p_cor_raca),
        renda_per_capita = p_renda_per_capita,
        identidade_genero = btrim(p_identidade_genero),
        tipo_deficiencia = btrim(p_tipo_deficiencia),
        forma_acesso = btrim(p_forma_acesso),
        nome_mae = nullif(btrim(coalesce(p_nome_mae, '')), ''),
        nacionalidade = coalesce(nullif(btrim(coalesce(p_nacionalidade, '')), ''), 'Brasileira'),
        sexo = nullif(btrim(coalesce(p_sexo, '')), ''),
        foto_url = coalesce(p_foto_url, foto_url),
        dossie_status = 'pendente',
        dossie_observacoes = null,
        dossie_aprovado_em = null,
        dossie_aprovado_por = null
    where id = v_id
    returning * into v_perfil;

    if v_perfil.id is null then
        raise exception 'Perfil não encontrado.' using errcode = 'P0002';
    end if;

    return v_perfil;
end;
$$;

create or replace function public.definir_foto_perfil(p_path text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_id uuid := auth.uid();
    v_perfil public.profiles;
begin
    if v_id is null then
        raise exception 'Sessão inválida. Faça login novamente.' using errcode = '42501';
    end if;

    p_path := nullif(btrim(coalesce(p_path, '')), '');

    if p_path is not null
       and p_path !~ '^https?://'
       and p_path not like v_id::text || '/%' then
        raise exception 'Caminho de foto inválido.' using errcode = '42501';
    end if;

    update public.profiles
    set foto_url = p_path,
        dossie_status = 'pendente',
        dossie_observacoes = null,
        dossie_aprovado_em = null,
        dossie_aprovado_por = null
    where id = v_id
    returning * into v_perfil;

    if v_perfil.id is null then
        raise exception 'Perfil não encontrado.' using errcode = 'P0002';
    end if;

    return v_perfil;
end;
$$;

create or replace function public.auditar_dossie(
    p_aluno_id uuid,
    p_status text,
    p_observacoes text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_perfil public.profiles;
    v_docs_faltando text;
begin
    if not public.sulsafe_is_admin() then
        raise exception 'Apenas administradores podem auditar dossiês.' using errcode = '42501';
    end if;

    if p_status is null or p_status not in ('pendente', 'aprovado', 'rejeitado') then
        raise exception 'Status de dossiê inválido.' using errcode = '23514';
    end if;

    if p_status = 'aprovado' then
        if not exists (
            select 1
            from public.profiles p
            where p.id = p_aluno_id
              and p.role = 'aluno'
              and p.cpf is not null
              and p.data_nascimento is not null
              and p.cor_raca is not null
              and p.renda_per_capita is not null
              and p.identidade_genero is not null
              and p.tipo_deficiencia is not null
              and p.forma_acesso is not null
              and p.foto_url is not null
        ) then
            raise exception 'Dossiê incompleto: preencha todos os dados obrigatórios antes de aprovar.';
        end if;

        select string_agg(t.tipo, ', ')
        into v_docs_faltando
        from unnest(
            array['FOTO_3X4', 'RG', 'CPF', 'HISTORICO_ESCOLAR', 'COMPROVANTE_RESIDENCIA']
        ) as t(tipo)
        where not exists (
            select 1
            from public.documentos_aluno d
            where d.aluno_id = p_aluno_id
              and d.tipo_documento = t.tipo
              and d.status = 'aprovado'
        );

        if v_docs_faltando is not null then
            raise exception 'Documentos obrigatórios pendentes de aprovação: %.', v_docs_faltando;
        end if;
    end if;

    update public.profiles
    set dossie_status = p_status,
        dossie_observacoes = nullif(btrim(coalesce(p_observacoes, '')), ''),
        dossie_aprovado_em = case when p_status = 'aprovado' then now() else null end,
        dossie_aprovado_por = case when p_status = 'aprovado' then auth.uid() else null end
    where id = p_aluno_id
    returning * into v_perfil;

    if v_perfil.id is null then
        raise exception 'Aluno não encontrado.' using errcode = 'P0002';
    end if;

    return v_perfil;
end;
$$;

-- ============================================================
-- 5. PERMISSÕES DAS RPCS
-- ============================================================

revoke all on function public.atualizar_meu_dossie(
    text, text, date, text, numeric, text, text, text, text, text, text, text
) from public;
revoke all on function public.definir_foto_perfil(text) from public;
revoke all on function public.auditar_dossie(uuid, text, text) from public;

grant execute on function public.atualizar_meu_dossie(
    text, text, date, text, numeric, text, text, text, text, text, text, text
) to authenticated;
grant execute on function public.definir_foto_perfil(text) to authenticated;
grant execute on function public.auditar_dossie(uuid, text, text) to authenticated;

-- ============================================================
-- 6. RLS: DOCUMENTOS DO ALUNO
-- ============================================================

alter table public.documentos_aluno enable row level security;

drop policy if exists "Aluno lê próprios documentos" on public.documentos_aluno;
create policy "Aluno lê próprios documentos"
on public.documentos_aluno
for select
to authenticated
using (
    aluno_id = auth.uid()
    or public.sulsafe_is_admin()
);

drop policy if exists "Aluno envia próprios documentos" on public.documentos_aluno;
create policy "Aluno envia próprios documentos"
on public.documentos_aluno
for insert
to authenticated
with check (
    aluno_id = auth.uid()
    and status = 'pendente'
);

drop policy if exists "Admin envia documentos" on public.documentos_aluno;
create policy "Admin envia documentos"
on public.documentos_aluno
for insert
to authenticated
with check (public.sulsafe_is_admin());

drop policy if exists "Aluno atualiza próprios documentos" on public.documentos_aluno;
create policy "Aluno atualiza próprios documentos"
on public.documentos_aluno
for update
to authenticated
using (aluno_id = auth.uid())
with check (aluno_id = auth.uid());

drop policy if exists "Admin atualiza documentos" on public.documentos_aluno;
create policy "Admin atualiza documentos"
on public.documentos_aluno
for update
to authenticated
using (public.sulsafe_is_admin())
with check (public.sulsafe_is_admin());

drop policy if exists "Aluno exclui próprios documentos pendentes" on public.documentos_aluno;
create policy "Aluno exclui próprios documentos pendentes"
on public.documentos_aluno
for delete
to authenticated
using (
    (aluno_id = auth.uid() and status <> 'aprovado')
    or public.sulsafe_is_admin()
);

revoke all on public.documentos_aluno from anon;
grant select, insert, update, delete on public.documentos_aluno to authenticated;
grant all on public.documentos_aluno to service_role;

-- ============================================================
-- 7. BUCKET PRIVADO E POLÍTICAS DO STORAGE
-- ============================================================

insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'documentos-alunos',
    'documentos-alunos',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "sulsafe_docs_alunos_select" on storage.objects;
create policy "sulsafe_docs_alunos_select"
on storage.objects
for select
to authenticated
using (
    bucket_id = 'documentos-alunos'
    and (
        (storage.foldername(name))[1] = auth.uid()::text
        or public.sulsafe_is_admin()
    )
);

drop policy if exists "sulsafe_docs_alunos_insert" on storage.objects;
create policy "sulsafe_docs_alunos_insert"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'documentos-alunos'
    and (
        (storage.foldername(name))[1] = auth.uid()::text
        or public.sulsafe_is_admin()
    )
);

drop policy if exists "sulsafe_docs_alunos_update" on storage.objects;
create policy "sulsafe_docs_alunos_update"
on storage.objects
for update
to authenticated
using (
    bucket_id = 'documentos-alunos'
    and (
        (storage.foldername(name))[1] = auth.uid()::text
        or public.sulsafe_is_admin()
    )
)
with check (
    bucket_id = 'documentos-alunos'
    and (
        (storage.foldername(name))[1] = auth.uid()::text
        or public.sulsafe_is_admin()
    )
);

drop policy if exists "sulsafe_docs_alunos_delete" on storage.objects;
create policy "sulsafe_docs_alunos_delete"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'documentos-alunos'
    and (
        (storage.foldername(name))[1] = auth.uid()::text
        or public.sulsafe_is_admin()
    )
);

notify pgrst, 'reload schema';

commit;
