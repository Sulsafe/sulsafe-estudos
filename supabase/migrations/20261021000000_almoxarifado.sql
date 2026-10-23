-- ============================================================
-- SULSAFE ESTUDOS - MÓDULO ALMOXARIFADO
-- Migration versionada e não destrutiva.
--
-- Aplicar no Supabase (SQL Editor ou `supabase db push`).
-- Não cria dados fictícios, usuários ou credenciais.
-- ============================================================

-- ============================================================
-- 1. AUTORIZAÇÃO
-- ============================================================
create or replace function public.is_almox_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select
        auth.uid() is not null
        and lower(coalesce(auth.jwt() ->> 'email', ''))
            = 'sulsafetreinamentos@gmail.com';
$$;
revoke all on function public.is_almox_admin() from public;
grant execute on function public.is_almox_admin() to authenticated;

create or replace function public.almox_assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.is_almox_admin() then
        raise exception 'Acesso negado ao Almoxarifado.'
            using errcode = '42501';
    end if;
end;
$$;

revoke all on function public.almox_assert_admin() from public;
grant execute on function public.almox_assert_admin() to authenticated;

-- ============================================================
-- 2. TABELAS
-- ============================================================
create table if not exists public.almox_categorias (
    id uuid primary key default gen_random_uuid(),
    nome text not null,
    descricao text,
    criado_em timestamptz not null default now()
);

create unique index if not exists almox_categorias_nome_uidx
    on public.almox_categorias (lower(nome));

create table if not exists public.almox_fornecedores (
    id uuid primary key default gen_random_uuid(),
    razao_social text not null,
    nome_fantasia text,
    cnpj text,
    email text,
    telefone text,
    endereco text,
    observacoes text,
    ativo boolean not null default true,
    criado_por uuid references public.profiles(id) on delete set null,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);

create unique index if not exists almox_fornecedores_cnpj_uidx
    on public.almox_fornecedores (cnpj)
    where cnpj is not null;

create table if not exists public.almox_itens (
    id uuid primary key default gen_random_uuid(),
    codigo text not null,
    nome text not null,
    descricao text,
    categoria_id uuid references public.almox_categorias(id) on delete set null,
    marca text,
    modelo text,
    unidade_medida text not null default 'UN',
    tipo_controle text not null default 'quantidade'
        check (tipo_controle in ('quantidade', 'lote', 'individual')),
    saldo_atual numeric(14,3) not null default 0
        check (saldo_atual >= 0),
    estoque_minimo numeric(14,3) not null default 0
        check (estoque_minimo >= 0),
    estoque_maximo numeric(14,3)
        check (estoque_maximo is null or estoque_maximo >= 0),
    localizacao text,
    prateleira text,
    armario text,
    setor text,
    fornecedor_padrao_id uuid references public.almox_fornecedores(id) on delete set null,
    custo_unitario numeric(14,4)
        check (custo_unitario is null or custo_unitario >= 0),
    numero_serie text,
    patrimonio text,
    situacao text not null default 'ativo'
        check (situacao in ('ativo', 'inativo', 'bloqueado', 'descartado')),
    observacoes text,
    criado_por uuid references public.profiles(id) on delete set null,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);

create unique index if not exists almox_itens_codigo_uidx
    on public.almox_itens (lower(codigo));

create index if not exists almox_itens_categoria_idx
    on public.almox_itens (categoria_id);
create index if not exists almox_itens_situacao_idx
    on public.almox_itens (situacao);
create index if not exists almox_itens_nome_idx
    on public.almox_itens (lower(nome));

create table if not exists public.almox_lotes (
    id uuid primary key default gen_random_uuid(),
    item_id uuid not null references public.almox_itens(id) on delete restrict,
    codigo_lote text not null,
    quantidade_inicial numeric(14,3) not null
        check (quantidade_inicial > 0),
    quantidade_atual numeric(14,3) not null default 0
        check (quantidade_atual >= 0),
    data_fabricacao date,
    data_validade date,
    custo_unitario numeric(14,4)
        check (custo_unitario is null or custo_unitario >= 0),
    fornecedor_id uuid references public.almox_fornecedores(id) on delete set null,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint almox_lotes_item_codigo_uidx unique (item_id, codigo_lote)
);

create index if not exists almox_lotes_item_idx
    on public.almox_lotes (item_id);
create index if not exists almox_lotes_validade_idx
    on public.almox_lotes (data_validade)
    where quantidade_atual > 0;
create index if not exists almox_lotes_saldo_idx
    on public.almox_lotes (quantidade_atual)
    where quantidade_atual > 0;

create table if not exists public.almox_movimentacoes (
    id uuid primary key default gen_random_uuid(),
    operacao_id uuid not null default gen_random_uuid(),
    tipo text not null
        check (tipo in ('entrada', 'saida', 'ajuste', 'transferencia', 'perda', 'descarte', 'estorno')),
    item_id uuid not null references public.almox_itens(id) on delete restrict,
    lote_id uuid references public.almox_lotes(id) on delete restrict,
    quantidade numeric(14,3) not null
        check (quantidade >= 0),
    saldo_anterior numeric(14,3) not null,
    saldo_posterior numeric(14,3) not null,
    data_hora timestamptz not null default now(),
    usuario_id uuid references public.profiles(id) on delete set null,
    usuario_nome text,
    responsavel text,
    motivo text,
    origem text,
    destino text,
    setor text,
    documento text,
    observacoes text,
    estorno_de uuid references public.almox_movimentacoes(id) on delete restrict,
    criado_em timestamptz not null default now()
);

create index if not exists almox_mov_item_idx
    on public.almox_movimentacoes (item_id, data_hora desc);
create index if not exists almox_mov_data_idx
    on public.almox_movimentacoes (data_hora desc);
create index if not exists almox_mov_tipo_idx
    on public.almox_movimentacoes (tipo);
create index if not exists almox_mov_lote_idx
    on public.almox_movimentacoes (lote_id);
create index if not exists almox_mov_usuario_idx
    on public.almox_movimentacoes (usuario_id);
create index if not exists almox_mov_operacao_idx
    on public.almox_movimentacoes (operacao_id);
create index if not exists almox_mov_estorno_idx
    on public.almox_movimentacoes (estorno_de)
    where estorno_de is not null;
create unique index if not exists almox_mov_estorno_unico_uidx
    on public.almox_movimentacoes (estorno_de)
    where estorno_de is not null;

-- ============================================================
-- 3. TRIGGERS DE PROTEÇÃO E AUDITORIA
-- ============================================================
create or replace function public.almox_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.atualizado_em = now();
    return new;
end;
$$;

drop trigger if exists trg_almox_fornecedores_touch on public.almox_fornecedores;
create trigger trg_almox_fornecedores_touch
before update on public.almox_fornecedores
for each row execute function public.almox_touch_updated_at();

drop trigger if exists trg_almox_itens_touch on public.almox_itens;
create trigger trg_almox_itens_touch
before update on public.almox_itens
for each row execute function public.almox_touch_updated_at();

drop trigger if exists trg_almox_lotes_touch on public.almox_lotes;
create trigger trg_almox_lotes_touch
before update on public.almox_lotes
for each row execute function public.almox_touch_updated_at();

-- O saldo só pode mudar dentro das RPCs de movimentação.
create or replace function public.almox_protect_item_stock()
returns trigger
language plpgsql
as $$
begin
    if new.saldo_atual is distinct from old.saldo_atual
       and current_user <> pg_catalog.pg_get_userbyid(
           (select relowner from pg_catalog.pg_class
            where oid = 'public.almox_itens'::pg_catalog.regclass)
       ) then
        raise exception 'O saldo do item só pode ser alterado por movimentações registradas.'
            using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_almox_itens_protect_stock on public.almox_itens;
create trigger trg_almox_itens_protect_stock
before update on public.almox_itens
for each row execute function public.almox_protect_item_stock();

create or replace function public.almox_protect_item_insert()
returns trigger
language plpgsql
as $$
begin
    if coalesce(new.saldo_atual, 0) <> 0
       and current_user <> pg_catalog.pg_get_userbyid(
           (select relowner from pg_catalog.pg_class
            where oid = 'public.almox_itens'::pg_catalog.regclass)
       ) then
        raise exception 'Itens devem ser cadastrados com saldo zero. Use entrada de material.'
            using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_almox_itens_protect_insert on public.almox_itens;
create trigger trg_almox_itens_protect_insert
before insert on public.almox_itens
for each row execute function public.almox_protect_item_insert();

-- A quantidade de lote só pode mudar dentro das RPCs de movimentação.
create or replace function public.almox_protect_lot_quantity()
returns trigger
language plpgsql
as $$
begin
    if new.quantidade_atual is distinct from old.quantidade_atual
       and current_user <> pg_catalog.pg_get_userbyid(
           (select relowner from pg_catalog.pg_class
            where oid = 'public.almox_lotes'::pg_catalog.regclass)
       ) then
        raise exception 'A quantidade de lote só pode ser alterada por movimentações registradas.'
            using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_almox_lotes_protect_quantity on public.almox_lotes;
create trigger trg_almox_lotes_protect_quantity
before update on public.almox_lotes
for each row execute function public.almox_protect_lot_quantity();

-- Movimentações efetivadas não podem ser editadas ou apagadas.
create or replace function public.almox_block_movement_mutation()
returns trigger
language plpgsql
as $$
begin
    raise exception 'Movimentações efetivadas não podem ser editadas ou excluídas. Use estorno ou ajuste.'
        using errcode = '42501';
end;
$$;

drop trigger if exists trg_almox_mov_immutable on public.almox_movimentacoes;
create trigger trg_almox_mov_immutable
before update or delete on public.almox_movimentacoes
for each row execute function public.almox_block_movement_mutation();

-- ============================================================
-- 4. RPCs TRANSACIONAIS
-- ============================================================
create or replace function public.almox_registrar_entrada(
    p_item_id uuid,
    p_quantidade numeric,
    p_lote text default null,
    p_validade date default null,
    p_fabricacao date default null,
    p_custo_unitario numeric default null,
    p_fornecedor_id uuid default null,
    p_documento text default null,
    p_responsavel text default null,
    p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_item public.almox_itens%rowtype;
    v_lote_id uuid;
    v_operacao_id uuid := gen_random_uuid();
    v_usuario_id uuid := auth.uid();
    v_usuario_nome text;
    v_saldo_anterior numeric(14,3);
    v_saldo_posterior numeric(14,3);
begin
    perform public.almox_assert_admin();

    if p_item_id is null then
        raise exception 'Informe o item da entrada.' using errcode = '22023';
    end if;
    if p_quantidade is null or p_quantidade <= 0 then
        raise exception 'A quantidade de entrada deve ser maior que zero.' using errcode = '22023';
    end if;

    select * into v_item
    from public.almox_itens
    where id = p_item_id
    for update;

    if not found then
        raise exception 'Item não encontrado.' using errcode = 'P0002';
    end if;
    if v_item.situacao <> 'ativo' then
        raise exception 'Somente itens ativos podem receber entradas.' using errcode = '22023';
    end if;
    if v_item.tipo_controle = 'individual' and p_quantidade <> 1 then
        raise exception 'Itens individualizados devem ser movimentados uma unidade por vez.' using errcode = '22023';
    end if;
    if v_item.tipo_controle = 'lote'
       and nullif(btrim(coalesce(p_lote, '')), '') is null then
        raise exception 'Informe o lote para itens controlados por lote.' using errcode = '22023';
    end if;
    if v_item.tipo_controle = 'lote' and p_validade is null then
        raise exception 'Informe a validade para itens controlados por lote.' using errcode = '22023';
    end if;
    if v_item.tipo_controle <> 'lote'
       and nullif(btrim(coalesce(p_lote, '')), '') is not null then
        raise exception 'Somente itens controlados por lote aceitam lote/validade.' using errcode = '22023';
    end if;

    select nome_completo into v_usuario_nome
    from public.profiles
    where id = v_usuario_id;

    perform set_config('almox.internal_movement', 'on', true);

    if p_lote is not null and btrim(p_lote) <> '' then
        insert into public.almox_lotes (
            item_id, codigo_lote, quantidade_inicial, quantidade_atual,
            data_fabricacao, data_validade, custo_unitario, fornecedor_id
        ) values (
            p_item_id, btrim(p_lote), p_quantidade, p_quantidade,
            p_fabricacao, p_validade, p_custo_unitario, p_fornecedor_id
        )
        on conflict (item_id, codigo_lote) do update set
            quantidade_atual = public.almox_lotes.quantidade_atual + excluded.quantidade_atual,
            quantidade_inicial = public.almox_lotes.quantidade_inicial + excluded.quantidade_inicial,
            data_fabricacao = coalesce(excluded.data_fabricacao, public.almox_lotes.data_fabricacao),
            data_validade = coalesce(excluded.data_validade, public.almox_lotes.data_validade),
            custo_unitario = coalesce(excluded.custo_unitario, public.almox_lotes.custo_unitario),
            fornecedor_id = coalesce(excluded.fornecedor_id, public.almox_lotes.fornecedor_id),
            atualizado_em = now()
        returning id into v_lote_id;
    end if;

    v_saldo_anterior := v_item.saldo_atual;
    v_saldo_posterior := v_saldo_anterior + p_quantidade;

    update public.almox_itens
    set saldo_atual = v_saldo_posterior,
        custo_unitario = coalesce(p_custo_unitario, custo_unitario),
        fornecedor_padrao_id = coalesce(p_fornecedor_id, fornecedor_padrao_id),
        atualizado_em = now()
    where id = p_item_id;

    insert into public.almox_movimentacoes (
        operacao_id, tipo, item_id, lote_id, quantidade,
        saldo_anterior, saldo_posterior, usuario_id, usuario_nome,
        responsavel, motivo, documento, observacoes
    ) values (
        v_operacao_id, 'entrada', p_item_id, v_lote_id, p_quantidade,
        v_saldo_anterior, v_saldo_posterior, v_usuario_id, v_usuario_nome,
        nullif(btrim(coalesce(p_responsavel, '')), ''), 'Entrada de material',
        nullif(btrim(coalesce(p_documento, '')), ''),
        nullif(btrim(coalesce(p_observacoes, '')), '')
    );

    return v_operacao_id;
end;
$$;

revoke all on function public.almox_registrar_entrada(uuid, numeric, text, date, date, numeric, uuid, text, text, text) from public;
grant execute on function public.almox_registrar_entrada(uuid, numeric, text, date, date, numeric, uuid, text, text, text) to authenticated;

create or replace function public.almox_registrar_saida(
    p_item_id uuid,
    p_quantidade numeric,
    p_lote_id uuid default null,
    p_motivo text default null,
    p_destino text default null,
    p_setor text default null,
    p_responsavel text default null,
    p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_item public.almox_itens%rowtype;
    v_lote public.almox_lotes%rowtype;
    v_operacao_id uuid := gen_random_uuid();
    v_usuario_id uuid := auth.uid();
    v_usuario_nome text;
    v_saldo_anterior numeric(14,3);
    v_saldo_posterior numeric(14,3);
    v_restante numeric(14,3);
    v_alocacao numeric(14,3);
    v_total_disponivel numeric(14,3);
begin
    perform public.almox_assert_admin();

    if p_item_id is null then
        raise exception 'Informe o item da saída.' using errcode = '22023';
    end if;
    if p_quantidade is null or p_quantidade <= 0 then
        raise exception 'A quantidade de saída deve ser maior que zero.' using errcode = '22023';
    end if;
    if nullif(btrim(coalesce(p_motivo, '')), '') is null then
        raise exception 'Informe o motivo da retirada.' using errcode = '22023';
    end if;

    select * into v_item
    from public.almox_itens
    where id = p_item_id
    for update;

    if not found then
        raise exception 'Item não encontrado.' using errcode = 'P0002';
    end if;
    if v_item.situacao <> 'ativo' then
        raise exception 'Somente itens ativos podem ter saída.' using errcode = '22023';
    end if;
    if v_item.tipo_controle = 'individual' and p_quantidade <> 1 then
        raise exception 'Itens individualizados devem ser movimentados uma unidade por vez.' using errcode = '22023';
    end if;
    if v_item.tipo_controle <> 'lote' and p_lote_id is not null then
        raise exception 'Este item não é controlado por lote.' using errcode = '22023';
    end if;

    select nome_completo into v_usuario_nome
    from public.profiles
    where id = v_usuario_id;

    perform set_config('almox.internal_movement', 'on', true);

    if v_item.tipo_controle = 'lote' then
        if p_lote_id is not null then
            select * into v_lote
            from public.almox_lotes
            where id = p_lote_id and item_id = p_item_id
            for update;

            if not found then
                raise exception 'Lote não encontrado para este item.' using errcode = 'P0002';
            end if;
            if v_lote.data_validade is not null and v_lote.data_validade < current_date then
                raise exception 'Lote vencido não pode ser utilizado em uma saída normal.' using errcode = '22023';
            end if;
            if v_lote.quantidade_atual < p_quantidade then
                raise exception 'Quantidade insuficiente no lote selecionado.' using errcode = '22023';
            end if;
            if v_item.saldo_atual < p_quantidade then
                raise exception 'Saldo insuficiente para a saída.' using errcode = '22023';
            end if;

            v_saldo_anterior := v_item.saldo_atual;
            v_saldo_posterior := v_saldo_anterior - p_quantidade;

            update public.almox_lotes
            set quantidade_atual = quantidade_atual - p_quantidade,
                atualizado_em = now()
            where id = v_lote.id;

            update public.almox_itens
            set saldo_atual = v_saldo_posterior,
                atualizado_em = now()
            where id = p_item_id;

            insert into public.almox_movimentacoes (
                operacao_id, tipo, item_id, lote_id, quantidade,
                saldo_anterior, saldo_posterior, usuario_id, usuario_nome,
                responsavel, motivo, destino, setor, observacoes
            ) values (
                v_operacao_id, 'saida', p_item_id, v_lote.id, p_quantidade,
                v_saldo_anterior, v_saldo_posterior, v_usuario_id, v_usuario_nome,
                nullif(btrim(coalesce(p_responsavel, '')), ''),
                btrim(p_motivo),
                nullif(btrim(coalesce(p_destino, '')), ''),
                nullif(btrim(coalesce(p_setor, '')), ''),
                nullif(btrim(coalesce(p_observacoes, '')), '')
            );

            return v_operacao_id;
        end if;

        select coalesce(sum(quantidade_atual), 0)
        into v_total_disponivel
        from public.almox_lotes
        where item_id = p_item_id
          and quantidade_atual > 0
          and (data_validade is null or data_validade >= current_date);

        if v_total_disponivel < p_quantidade then
            raise exception 'Estoque válido insuficiente. Verifique lotes vencidos ou quantidade disponível.'
                using errcode = '22023';
        end if;

        v_restante := p_quantidade;
        v_saldo_anterior := v_item.saldo_atual;

        for v_lote in
            select *
            from public.almox_lotes
            where item_id = p_item_id
              and quantidade_atual > 0
              and (data_validade is null or data_validade >= current_date)
            order by data_validade nulls last, criado_em
            for update
        loop
            exit when v_restante <= 0;

            v_alocacao := least(v_lote.quantidade_atual, v_restante);
            v_saldo_posterior := v_saldo_anterior - v_alocacao;

            update public.almox_lotes
            set quantidade_atual = quantidade_atual - v_alocacao,
                atualizado_em = now()
            where id = v_lote.id;

            insert into public.almox_movimentacoes (
                operacao_id, tipo, item_id, lote_id, quantidade,
                saldo_anterior, saldo_posterior, usuario_id, usuario_nome,
                responsavel, motivo, destino, setor, observacoes
            ) values (
                v_operacao_id, 'saida', p_item_id, v_lote.id, v_alocacao,
                v_saldo_anterior, v_saldo_posterior, v_usuario_id, v_usuario_nome,
                nullif(btrim(coalesce(p_responsavel, '')), ''),
                btrim(p_motivo),
                nullif(btrim(coalesce(p_destino, '')), ''),
                nullif(btrim(coalesce(p_setor, '')), ''),
                nullif(btrim(coalesce(p_observacoes, '')), '')
            );

            v_saldo_anterior := v_saldo_posterior;
            v_restante := v_restante - v_alocacao;
        end loop;

        if v_restante > 0 then
            raise exception 'Estoque insuficiente para concluir a saída.' using errcode = '22023';
        end if;

        update public.almox_itens
        set saldo_atual = v_saldo_anterior,
            atualizado_em = now()
        where id = p_item_id;

        return v_operacao_id;
    end if;

    if v_item.saldo_atual < p_quantidade then
        raise exception 'Saldo insuficiente para a saída.' using errcode = '22023';
    end if;

    v_saldo_anterior := v_item.saldo_atual;
    v_saldo_posterior := v_saldo_anterior - p_quantidade;

    update public.almox_itens
    set saldo_atual = v_saldo_posterior,
        atualizado_em = now()
    where id = p_item_id;

    insert into public.almox_movimentacoes (
        operacao_id, tipo, item_id, lote_id, quantidade,
        saldo_anterior, saldo_posterior, usuario_id, usuario_nome,
        responsavel, motivo, destino, setor, observacoes
    ) values (
        v_operacao_id, 'saida', p_item_id, null, p_quantidade,
        v_saldo_anterior, v_saldo_posterior, v_usuario_id, v_usuario_nome,
        nullif(btrim(coalesce(p_responsavel, '')), ''),
        btrim(p_motivo),
        nullif(btrim(coalesce(p_destino, '')), ''),
        nullif(btrim(coalesce(p_setor, '')), ''),
        nullif(btrim(coalesce(p_observacoes, '')), '')
    );

    return v_operacao_id;
end;
$$;

revoke all on function public.almox_registrar_saida(uuid, numeric, uuid, text, text, text, text, text) from public;
grant execute on function public.almox_registrar_saida(uuid, numeric, uuid, text, text, text, text, text) to authenticated;

create or replace function public.almox_registrar_ajuste(
    p_item_id uuid,
    p_lote_id uuid,
    p_nova_quantidade numeric,
    p_tipo text default 'ajuste',
    p_motivo text default null,
    p_responsavel text default null,
    p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_item public.almox_itens%rowtype;
    v_lote public.almox_lotes%rowtype;
    v_operacao_id uuid := gen_random_uuid();
    v_usuario_id uuid := auth.uid();
    v_usuario_nome text;
    v_saldo_anterior numeric(14,3);
    v_saldo_posterior numeric(14,3);
    v_delta numeric(14,3);
    v_tipo text := coalesce(p_tipo, 'ajuste');
begin
    perform public.almox_assert_admin();

    if v_tipo not in ('ajuste', 'perda', 'descarte') then
        raise exception 'Tipo de ajuste inválido.' using errcode = '22023';
    end if;
    if p_item_id is null then
        raise exception 'Informe o item do ajuste.' using errcode = '22023';
    end if;
    if p_nova_quantidade is null or p_nova_quantidade < 0 then
        raise exception 'A nova quantidade não pode ser negativa.' using errcode = '22023';
    end if;
    if nullif(btrim(coalesce(p_motivo, '')), '') is null then
        raise exception 'Informe o motivo do ajuste, perda ou descarte.' using errcode = '22023';
    end if;

    select * into v_item
    from public.almox_itens
    where id = p_item_id
    for update;

    if not found then
        raise exception 'Item não encontrado.' using errcode = 'P0002';
    end if;
    if v_item.situacao = 'descartado' then
        raise exception 'Itens descartados não podem ser ajustados.' using errcode = '22023';
    end if;

    select nome_completo into v_usuario_nome
    from public.profiles
    where id = v_usuario_id;

    perform set_config('almox.internal_movement', 'on', true);

    if v_item.tipo_controle = 'lote' then
        if p_lote_id is null then
            raise exception 'Informe o lote para ajuste de itens controlados por lote.' using errcode = '22023';
        end if;

        select * into v_lote
        from public.almox_lotes
        where id = p_lote_id and item_id = p_item_id
        for update;

        if not found then
            raise exception 'Lote não encontrado para este item.' using errcode = 'P0002';
        end if;
        if v_tipo in ('perda', 'descarte') and p_nova_quantidade > v_lote.quantidade_atual then
            raise exception 'A baixa por perda/descarte não pode ultrapassar o saldo do lote.' using errcode = '22023';
        end if;
        if v_tipo in ('perda', 'descarte') and p_nova_quantidade >= v_lote.quantidade_atual then
            raise exception 'Perda/descarte deve reduzir a quantidade do lote. Use ajuste para aumentar.' using errcode = '22023';
        end if;

        v_delta := p_nova_quantidade - v_lote.quantidade_atual;
        if v_delta = 0 then
            raise exception 'Nenhuma diferença de quantidade para registrar.' using errcode = '22023';
        end if;

        v_saldo_anterior := v_item.saldo_atual;
        v_saldo_posterior := v_saldo_anterior + v_delta;

        if v_saldo_posterior < 0 then
            raise exception 'O ajuste resultaria em saldo negativo.' using errcode = '22023';
        end if;

        update public.almox_lotes
        set quantidade_atual = p_nova_quantidade,
            atualizado_em = now()
        where id = v_lote.id;

        update public.almox_itens
        set saldo_atual = v_saldo_posterior,
            atualizado_em = now()
        where id = p_item_id;

        insert into public.almox_movimentacoes (
            operacao_id, tipo, item_id, lote_id, quantidade,
            saldo_anterior, saldo_posterior, usuario_id, usuario_nome,
            responsavel, motivo, observacoes
        ) values (
            v_operacao_id, v_tipo, p_item_id, v_lote.id, abs(v_delta),
            v_saldo_anterior, v_saldo_posterior, v_usuario_id, v_usuario_nome,
            nullif(btrim(coalesce(p_responsavel, '')), ''),
            btrim(p_motivo),
            nullif(btrim(coalesce(p_observacoes, '')), '')
        );

        return v_operacao_id;
    end if;

    if p_lote_id is not null then
        raise exception 'Este item não é controlado por lote.' using errcode = '22023';
    end if;
    if v_tipo in ('perda', 'descarte') and p_nova_quantidade > v_item.saldo_atual then
        raise exception 'A baixa por perda/descarte não pode ultrapassar o saldo atual.' using errcode = '22023';
    end if;
    if v_tipo in ('perda', 'descarte') and p_nova_quantidade >= v_item.saldo_atual then
        raise exception 'Perda/descarte deve reduzir o saldo. Use ajuste para aumentar.' using errcode = '22023';
    end if;

    v_saldo_anterior := v_item.saldo_atual;
    v_delta := p_nova_quantidade - v_saldo_anterior;
    if v_delta = 0 then
        raise exception 'Nenhuma diferença de quantidade para registrar.' using errcode = '22023';
    end if;

    v_saldo_posterior := p_nova_quantidade;

    update public.almox_itens
    set saldo_atual = v_saldo_posterior,
        atualizado_em = now()
    where id = p_item_id;

    insert into public.almox_movimentacoes (
        operacao_id, tipo, item_id, lote_id, quantidade,
        saldo_anterior, saldo_posterior, usuario_id, usuario_nome,
        responsavel, motivo, observacoes
    ) values (
        v_operacao_id, v_tipo, p_item_id, null, abs(v_delta),
        v_saldo_anterior, v_saldo_posterior, v_usuario_id, v_usuario_nome,
        nullif(btrim(coalesce(p_responsavel, '')), ''),
        btrim(p_motivo),
        nullif(btrim(coalesce(p_observacoes, '')), '')
    );

    return v_operacao_id;
end;
$$;

revoke all on function public.almox_registrar_ajuste(uuid, uuid, numeric, text, text, text, text) from public;
grant execute on function public.almox_registrar_ajuste(uuid, uuid, numeric, text, text, text, text) to authenticated;

create or replace function public.almox_transferir(
    p_item_id uuid,
    p_localizacao text default null,
    p_prateleira text default null,
    p_armario text default null,
    p_setor text default null,
    p_motivo text default null,
    p_responsavel text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_item public.almox_itens%rowtype;
    v_operacao_id uuid := gen_random_uuid();
    v_usuario_id uuid := auth.uid();
    v_usuario_nome text;
    v_origem text;
    v_destino text;
begin
    perform public.almox_assert_admin();

    if p_item_id is null then
        raise exception 'Informe o item da transferência.' using errcode = '22023';
    end if;
    if nullif(btrim(coalesce(p_motivo, '')), '') is null then
        raise exception 'Informe o motivo da transferência.' using errcode = '22023';
    end if;

    select * into v_item
    from public.almox_itens
    where id = p_item_id
    for update;

    if not found then
        raise exception 'Item não encontrado.' using errcode = 'P0002';
    end if;

    v_origem := concat_ws(' / ',
        nullif(btrim(coalesce(v_item.localizacao, '')), ''),
        nullif(btrim(coalesce(v_item.prateleira, '')), ''),
        nullif(btrim(coalesce(v_item.armario, '')), ''),
        nullif(btrim(coalesce(v_item.setor, '')), '')
    );
    v_destino := concat_ws(' / ',
        nullif(btrim(coalesce(p_localizacao, '')), ''),
        nullif(btrim(coalesce(p_prateleira, '')), ''),
        nullif(btrim(coalesce(p_armario, '')), ''),
        nullif(btrim(coalesce(p_setor, '')), '')
    );

    if v_destino is null or v_destino = '' then
        raise exception 'Informe ao menos um destino para a transferência.' using errcode = '22023';
    end if;

    select nome_completo into v_usuario_nome
    from public.profiles
    where id = v_usuario_id;

    update public.almox_itens
    set localizacao = nullif(btrim(coalesce(p_localizacao, '')), ''),
        prateleira = nullif(btrim(coalesce(p_prateleira, '')), ''),
        armario = nullif(btrim(coalesce(p_armario, '')), ''),
        setor = nullif(btrim(coalesce(p_setor, '')), ''),
        atualizado_em = now()
    where id = p_item_id;

    insert into public.almox_movimentacoes (
        operacao_id, tipo, item_id, lote_id, quantidade,
        saldo_anterior, saldo_posterior, usuario_id, usuario_nome,
        responsavel, motivo, origem, destino, setor
    ) values (
        v_operacao_id, 'transferencia', p_item_id, null, 0,
        v_item.saldo_atual, v_item.saldo_atual, v_usuario_id, v_usuario_nome,
        nullif(btrim(coalesce(p_responsavel, '')), ''),
        btrim(p_motivo),
        v_origem,
        v_destino,
        nullif(btrim(coalesce(p_setor, '')), '')
    );

    return v_operacao_id;
end;
$$;

revoke all on function public.almox_transferir(uuid, text, text, text, text, text, text) from public;
grant execute on function public.almox_transferir(uuid, text, text, text, text, text, text) to authenticated;

create or replace function public.almox_estornar_movimentacao(
    p_movimentacao_id uuid,
    p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_mov public.almox_movimentacoes%rowtype;
    v_item public.almox_itens%rowtype;
    v_lote public.almox_lotes%rowtype;
    v_operacao_id uuid := gen_random_uuid();
    v_usuario_id uuid := auth.uid();
    v_usuario_nome text;
    v_saldo_anterior numeric(14,3);
    v_saldo_posterior numeric(14,3);
begin
    perform public.almox_assert_admin();

    if p_movimentacao_id is null then
        raise exception 'Informe a movimentação a estornar.' using errcode = '22023';
    end if;
    if nullif(btrim(coalesce(p_motivo, '')), '') is null then
        raise exception 'Informe o motivo do estorno.' using errcode = '22023';
    end if;

    select * into v_mov
    from public.almox_movimentacoes
    where id = p_movimentacao_id
    for update;

    if not found then
        raise exception 'Movimentação não encontrada.' using errcode = 'P0002';
    end if;
    if v_mov.tipo not in ('entrada', 'saida') then
        raise exception 'Somente entradas e saídas podem ser estornadas. Use ajuste para os demais casos.'
            using errcode = '22023';
    end if;
    if exists (select 1 from public.almox_movimentacoes where estorno_de = v_mov.id) then
        raise exception 'Esta movimentação já foi estornada.' using errcode = '22023';
    end if;

    select * into v_item
    from public.almox_itens
    where id = v_mov.item_id
    for update;

    if not found then
        raise exception 'Item da movimentação não encontrado.' using errcode = 'P0002';
    end if;

    select nome_completo into v_usuario_nome
    from public.profiles
    where id = v_usuario_id;

    perform set_config('almox.internal_movement', 'on', true);

    if v_mov.lote_id is not null then
        select * into v_lote
        from public.almox_lotes
        where id = v_mov.lote_id
        for update;

        if not found then
            raise exception 'Lote da movimentação não encontrado.' using errcode = 'P0002';
        end if;
    end if;

    if v_mov.tipo = 'entrada' then
        if v_item.saldo_atual < v_mov.quantidade then
            raise exception 'Saldo insuficiente para estornar a entrada.' using errcode = '22023';
        end if;
        if v_mov.lote_id is not null and v_lote.quantidade_atual < v_mov.quantidade then
            raise exception 'Saldo insuficiente no lote para estornar a entrada.' using errcode = '22023';
        end if;

        v_saldo_anterior := v_item.saldo_atual;
        v_saldo_posterior := v_saldo_anterior - v_mov.quantidade;

        update public.almox_itens
        set saldo_atual = v_saldo_posterior,
            atualizado_em = now()
        where id = v_item.id;

        if v_mov.lote_id is not null then
            update public.almox_lotes
            set quantidade_atual = quantidade_atual - v_mov.quantidade,
                atualizado_em = now()
            where id = v_mov.lote_id;
        end if;
    else
        v_saldo_anterior := v_item.saldo_atual;
        v_saldo_posterior := v_saldo_anterior + v_mov.quantidade;

        update public.almox_itens
        set saldo_atual = v_saldo_posterior,
            atualizado_em = now()
        where id = v_item.id;

        if v_mov.lote_id is not null then
            update public.almox_lotes
            set quantidade_atual = quantidade_atual + v_mov.quantidade,
                atualizado_em = now()
            where id = v_mov.lote_id;
        end if;
    end if;

    insert into public.almox_movimentacoes (
        operacao_id, tipo, item_id, lote_id, quantidade,
        saldo_anterior, saldo_posterior, usuario_id, usuario_nome,
        responsavel, motivo, origem, destino, estorno_de, observacoes
    ) values (
        v_operacao_id, 'estorno', v_mov.item_id, v_mov.lote_id, v_mov.quantidade,
        v_saldo_anterior, v_saldo_posterior, v_usuario_id, v_usuario_nome,
        v_mov.responsavel,
        btrim(p_motivo),
        v_mov.origem,
        v_mov.destino,
        v_mov.id,
        concat('Estorno da movimentação ', v_mov.id)
    );

    return v_operacao_id;
end;
$$;

revoke all on function public.almox_estornar_movimentacao(uuid, text) from public;
grant execute on function public.almox_estornar_movimentacao(uuid, text) to authenticated;

-- ============================================================
-- 5. RLS E PRIVILÉGIOS
-- ============================================================
alter table public.almox_categorias enable row level security;
alter table public.almox_fornecedores enable row level security;
alter table public.almox_itens enable row level security;
alter table public.almox_lotes enable row level security;
alter table public.almox_movimentacoes enable row level security;

-- Categorias
drop policy if exists almox_categorias_admin_select on public.almox_categorias;
create policy almox_categorias_admin_select on public.almox_categorias
    for select to authenticated using (public.is_almox_admin());

drop policy if exists almox_categorias_admin_insert on public.almox_categorias;
create policy almox_categorias_admin_insert on public.almox_categorias
    for insert to authenticated with check (public.is_almox_admin());

drop policy if exists almox_categorias_admin_update on public.almox_categorias;
create policy almox_categorias_admin_update on public.almox_categorias
    for update to authenticated using (public.is_almox_admin()) with check (public.is_almox_admin());

drop policy if exists almox_categorias_admin_delete on public.almox_categorias;
create policy almox_categorias_admin_delete on public.almox_categorias
    for delete to authenticated using (public.is_almox_admin());

-- Fornecedores
drop policy if exists almox_fornecedores_admin_select on public.almox_fornecedores;
create policy almox_fornecedores_admin_select on public.almox_fornecedores
    for select to authenticated using (public.is_almox_admin());

drop policy if exists almox_fornecedores_admin_insert on public.almox_fornecedores;
create policy almox_fornecedores_admin_insert on public.almox_fornecedores
    for insert to authenticated with check (public.is_almox_admin());

drop policy if exists almox_fornecedores_admin_update on public.almox_fornecedores;
create policy almox_fornecedores_admin_update on public.almox_fornecedores
    for update to authenticated using (public.is_almox_admin()) with check (public.is_almox_admin());

drop policy if exists almox_fornecedores_admin_delete on public.almox_fornecedores;
create policy almox_fornecedores_admin_delete on public.almox_fornecedores
    for delete to authenticated using (public.is_almox_admin());

-- Itens
drop policy if exists almox_itens_admin_select on public.almox_itens;
create policy almox_itens_admin_select on public.almox_itens
    for select to authenticated using (public.is_almox_admin());

drop policy if exists almox_itens_admin_insert on public.almox_itens;
create policy almox_itens_admin_insert on public.almox_itens
    for insert to authenticated with check (public.is_almox_admin());

drop policy if exists almox_itens_admin_update on public.almox_itens;
create policy almox_itens_admin_update on public.almox_itens
    for update to authenticated using (public.is_almox_admin()) with check (public.is_almox_admin());

drop policy if exists almox_itens_admin_delete on public.almox_itens;
create policy almox_itens_admin_delete on public.almox_itens
    for delete to authenticated using (public.is_almox_admin());

-- Lotes: leitura administrativa; escrita somente via RPC.
drop policy if exists almox_lotes_admin_select on public.almox_lotes;
create policy almox_lotes_admin_select on public.almox_lotes
    for select to authenticated using (public.is_almox_admin());

-- Movimentações: leitura administrativa; escrita somente via RPC.
drop policy if exists almox_movimentacoes_admin_select on public.almox_movimentacoes;
create policy almox_movimentacoes_admin_select on public.almox_movimentacoes
    for select to authenticated using (public.is_almox_admin());

revoke all on public.almox_categorias from anon;
revoke all on public.almox_fornecedores from anon;
revoke all on public.almox_itens from anon;
revoke all on public.almox_lotes from anon;
revoke all on public.almox_movimentacoes from anon;

grant select, insert, update, delete on public.almox_categorias to authenticated;
grant select, insert, update, delete on public.almox_fornecedores to authenticated;
revoke insert, update on public.almox_itens from authenticated;

grant insert (
    codigo, nome, descricao, categoria_id, marca, modelo,
    unidade_medida, tipo_controle, estoque_minimo, estoque_maximo,
    localizacao, prateleira, armario, setor, fornecedor_padrao_id,
    custo_unitario, numero_serie, patrimonio, situacao, observacoes
) on public.almox_itens to authenticated;

grant update (
    codigo, nome, descricao, categoria_id, marca, modelo,
    unidade_medida, tipo_controle, estoque_minimo, estoque_maximo,
    localizacao, prateleira, armario, setor, fornecedor_padrao_id,
    custo_unitario, numero_serie, patrimonio, situacao, observacoes
) on public.almox_itens to authenticated;

grant select, delete on public.almox_itens to authenticated;

-- Mesmo que um grant amplo exista, as operações abaixo são bloqueadas:
revoke all on public.almox_lotes from authenticated;
grant select on public.almox_lotes to authenticated;

revoke all on public.almox_movimentacoes from authenticated;
grant select on public.almox_movimentacoes to authenticated;

-- ============================================================
-- 6. COMENTÁRIOS DE DOCUMENTAÇÃO
-- ============================================================
comment on table public.almox_itens is 'Catálogo de materiais do Almoxarifado. saldo_atual é mantido exclusivamente pelas RPCs de movimentação.';
comment on table public.almox_lotes is 'Lotes de itens perecíveis/controlados. quantidade_atual é mantida exclusivamente pelas RPCs de movimentação.';
comment on table public.almox_movimentacoes is 'Histórico imutável de movimentações do Almoxarifado. Correções via estorno ou ajuste.';
comment on function public.is_almox_admin() is 'Retorna true somente para a sessão autenticada cujo e-mail é sulsafetreinamentos@gmail.com.';
