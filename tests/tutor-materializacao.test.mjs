import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const sql = fs.readFileSync(
    new URL('../supabase/migrations/20261124020000_tutor_materializacao.sql', import.meta.url),
    'utf8'
)

const ADMIN = '00000000-0000-4000-8000-0000000000c1'
const PROF = '00000000-0000-4000-8000-0000000000c2'
const ALUNO = '00000000-0000-4000-8000-0000000000c3'
const EMP_A = '00000000-0000-4000-8000-0000000000d1'
const EMP_B = '00000000-0000-4000-8000-0000000000d2'

async function criarBanco() {
    const db = new PGlite()

    await db.exec(`
        create role anon;
        create role authenticated;

        create schema auth;
        create table auth.sessao (uid uuid, empresa_id uuid);
        insert into auth.sessao (uid, empresa_id) values (null, null);

        create function auth.uid() returns uuid
        language sql stable security definer set search_path = ''
        as $$ select uid from auth.sessao limit 1 $$;

        create function auth.jwt() returns jsonb
        language sql stable security definer set search_path = ''
        as $$
            select jsonb_build_object('app_metadata', jsonb_build_object('empresa_id', empresa_id))
            from auth.sessao limit 1
        $$;

        grant usage on schema auth to authenticated, anon;
        grant execute on function auth.uid() to authenticated, anon;
        grant execute on function auth.jwt() to authenticated, anon;

        create table public.profiles (id uuid primary key, role text, status text);
        insert into public.profiles (id, role, status) values
            ('${ADMIN}', 'admin', 'ativo'),
            ('${PROF}', 'professor', 'ativo'),
            ('${ALUNO}', 'aluno', 'ativo');

        create function public.sulsafe_conta_ativa() returns boolean
        language sql stable as $$ select true $$;

        create function public.sulsafe_empresa_id() returns uuid
        language sql stable security definer set search_path = ''
        as $$ select nullif(auth.jwt() -> 'app_metadata' ->> 'empresa_id', '')::uuid $$;

        create function public.sulsafe_is_admin() returns boolean
        language sql stable security definer set search_path = '' as $$
            select exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.role = 'admin' and p.status = 'ativo')
        $$;

        create function public.sulsafe_is_professor() returns boolean
        language sql stable security definer set search_path = '' as $$
            select exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.role = 'professor' and p.status = 'ativo')
        $$;

        create table public.ia_jobs (
            id uuid primary key,
            empresa_id uuid,
            criado_por uuid not null references public.profiles(id),
            tipo text not null,
            titulo text not null,
            prompt text not null,
            status text not null default 'PENDENTE',
            criado_em timestamptz not null default now()
        );

        create table public.ia_conteudos (
            id uuid primary key,
            job_id uuid not null references public.ia_jobs(id),
            empresa_id uuid,
            criado_por uuid not null references public.profiles(id),
            tipo text not null,
            titulo text not null,
            conteudo jsonb not null default '{}'::jsonb,
            aprovado boolean not null default false,
            aprovado_por uuid references public.profiles(id),
            aprovado_em timestamptz,
            rejeitado boolean not null default false,
            publicado boolean not null default false,
            publicado_por uuid references public.profiles(id),
            publicado_em timestamptz,
            criado_em timestamptz not null default now()
        );

        create table public.videoaulas (
            id uuid primary key default gen_random_uuid(),
            nr_id integer not null,
            titulo text not null,
            descricao text,
            url_video text,
            ordem integer default 0,
            publico boolean not null default true
        );

        create table public.materiais (
            id uuid primary key default gen_random_uuid(),
            nr_id integer not null,
            titulo text not null,
            descricao text,
            url text,
            tipo text default 'arquivo',
            criado_por uuid references public.profiles(id),
            publico boolean not null default true
        );
    `)

    await db.exec(sql)

    await db.query(`
        insert into public.ia_jobs (id, empresa_id, criado_por, tipo, titulo, prompt)
        values ('00000000-0000-4000-8000-0000000000e1', '${EMP_A}', '${PROF}', 'CURSO', 'NR-35', 'Pedido')
    `)

    return db
}

async function sessao(db, uid, empresa) {
    await db.exec('reset role')
    await db.query('update auth.sessao set uid = $1, empresa_id = $2', [uid, empresa])
}

const CONTEUDO = '00000000-0000-4000-8000-0000000000f1'

async function criarRascunho(db, { aprovado = true, empresa = EMP_A } = {}) {
    await db.query(`
        insert into public.ia_conteudos
            (id, job_id, empresa_id, criado_por, tipo, titulo, conteudo, aprovado, aprovado_por)
        values ($1, $2, $3, $4, 'CURSO', 'Trabalho em altura',
                '{"descricao":"Conteúdo gerado pelo Tutor","modulos":[]}'::jsonb, $5, $4)
    `, [CONTEUDO, '00000000-0000-4000-8000-0000000000e1', empresa, PROF, aprovado])
}

test('migration materializa rascunho aprovado em videoaula sem publicar', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())

    await criarRascunho(db)
    await sessao(db, PROF, EMP_A)

    const resultado = await db.query(`
        select public.sulsafe_materializar_rascunho_tutor($1, $2, $3)
    `, [CONTEUDO, 35, 'VIDEOAULA'])

    const materializado = resultado.rows[0].sulsafe_materializar_rascunho_tutor
    assert.equal(materializado.destino, 'VIDEOAULA')
    assert.equal(materializado.nr_id, 35)
    assert.equal(materializado.publico, false)

    const videoaula = await db.query('select * from public.videoaulas')
    assert.equal(videoaula.rows.length, 1)
    assert.equal(videoaula.rows[0].titulo, 'Trabalho em altura')
    assert.equal(videoaula.rows[0].publico, false)

    const rascunho = await db.query('select publicado, publicado_por, conteudo from public.ia_conteudos where id = $1', [CONTEUDO])
    assert.equal(rascunho.rows[0].publicado, false)
    assert.equal(rascunho.rows[0].publicado_por, null)
    assert.equal(rascunho.rows[0].conteudo.materializado_nr_id, 35)
})

test('bloqueia materialização duplicada, sem aprovação e com NR inválida', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())

    await criarRascunho(db)
    await sessao(db, PROF, EMP_A)

    await assert.rejects(
        () => db.query(`select public.sulsafe_materializar_rascunho_tutor($1, $2, $3)`, [CONTEUDO, 99, 'VIDEOAULA']),
        /NR válida/i
    )

    await db.query(`select public.sulsafe_materializar_rascunho_tutor($1, $2, $3)`, [CONTEUDO, 35, 'VIDEOAULA'])
    await assert.rejects(
        () => db.query(`select public.sulsafe_materializar_rascunho_tutor($1, $2, $3)`, [CONTEUDO, 35, 'VIDEOAULA']),
        /já foi materializado/i
    )

    const outro = '00000000-0000-4000-8000-0000000000f2'
    await db.query(`
        insert into public.ia_conteudos (id, job_id, empresa_id, criado_por, tipo, titulo, conteudo, aprovado)
        values ($1, $2, '${EMP_A}', '${PROF}', 'CURSO', 'Sem aprovação', '{}'::jsonb, false)
    `, [outro, '00000000-0000-4000-8000-0000000000e1'])

    await assert.rejects(
        () => db.query(`select public.sulsafe_materializar_rascunho_tutor($1, $2, $3)`, [outro, 35, 'VIDEOAULA']),
        /Aprove o rascunho/i
    )
})

test('aluno não materializa e professor não materializa rascunho de outra empresa', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())

    await criarRascunho(db)
    await sessao(db, ALUNO, EMP_A)

    await assert.rejects(
        () => db.query(`select public.sulsafe_materializar_rascunho_tutor($1, $2, $3)`, [CONTEUDO, 35, 'VIDEOAULA']),
        /Somente administradores e professores/i
    )

    await sessao(db, PROF, EMP_B)
    await assert.rejects(
        () => db.query(`select public.sulsafe_materializar_rascunho_tutor($1, $2, $3)`, [CONTEUDO, 35, 'VIDEOAULA']),
        /outra empresa/i
    )
})

test('materialização como MATERIAL exige URL', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())

    await criarRascunho(db)
    await sessao(db, PROF, EMP_A)

    await assert.rejects(
        () => db.query(`select public.sulsafe_materializar_rascunho_tutor($1, $2, $3)`, [CONTEUDO, 35, 'MATERIAL']),
        /Material requer uma URL/i
    )

    const resultado = await db.query(`
        select public.sulsafe_materializar_rascunho_tutor($1, $2, $3, $4, $5, $6)
    `, [CONTEUDO, 35, 'MATERIAL', null, null, 'https://exemplo.com/material.pdf'])

    assert.equal(resultado.rows[0].sulsafe_materializar_rascunho_tutor.destino, 'MATERIAL')
    const material = await db.query('select * from public.materiais')
    assert.equal(material.rows[0].tipo, 'ia_tutor')
    assert.equal(material.rows[0].publico, false)
})

test('listagem de rascunhos respeita empresa e role', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())

    await criarRascunho(db)
    await sessao(db, PROF, EMP_A)
    const daEmpresa = await db.query('select count(*)::int as n from public.sulsafe_listar_rascunhos_tutor()')
    assert.equal(daEmpresa.rows[0].n, 1)

    await sessao(db, PROF, EMP_B)
    const deOutra = await db.query('select count(*)::int as n from public.sulsafe_listar_rascunhos_tutor()')
    assert.equal(deOutra.rows[0].n, 0)

    await sessao(db, ALUNO, EMP_A)
    await assert.rejects(
        () => db.query('select * from public.sulsafe_listar_rascunhos_tutor()'),
        /Somente administradores e professores/i
    )
})

test('migration não contém comandos destrutivos', () => {
    assert.doesNotMatch(sql, /\bdrop\s+table\b/i)
    assert.doesNotMatch(sql, /\btruncate\b/i)
    assert.doesNotMatch(sql, /\bdelete\s+from\b/i)
})
