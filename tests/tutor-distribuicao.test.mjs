import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const materializacao = fs.readFileSync(
    new URL('../supabase/migrations/20261124020000_tutor_materializacao.sql', import.meta.url),
    'utf8'
)
const distribuicao = fs.readFileSync(
    new URL('../supabase/migrations/20261124100000_tutor_distribuicao.sql', import.meta.url),
    'utf8'
)

const ADMIN = '00000000-0000-4000-8000-0000000000c1'
const PROF = '00000000-0000-4000-8000-0000000000c2'
const ALUNO = '00000000-0000-4000-8000-0000000000c3'
const EMP_A = '00000000-0000-4000-8000-0000000000d1'
const EMP_B = '00000000-0000-4000-8000-0000000000d2'
const JOB = '00000000-0000-4000-8000-0000000000e1'
const CONTEUDO = '00000000-0000-4000-8000-0000000000f1'
const TURMA = '00000000-0000-4000-8000-0000000000a1'

const CONTEUDO_IA = JSON.stringify({
    descricao: 'Ementa sobre trabalho em altura.',
    modulos: [{
        titulo: 'Fundamentos',
        descricao: 'Conceitos básicos da NR 35.',
        aulas: [
            { titulo: 'Aplicação', descricao: 'Onde a norma se aplica.' },
            { titulo: 'Responsabilidades', descricao: 'Deveres do empregador.' }
        ]
    }]
})

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
                where p.id = auth.uid() and p.role in ('professor', 'admin') and p.status = 'ativo')
        $$;

        create table public.turmas (
            id uuid primary key,
            nome text not null,
            tipo text not null default 'turma',
            criado_por uuid not null references public.profiles(id)
        );
        insert into public.turmas (id, nome, tipo, criado_por)
        values ('${TURMA}', 'Turma NR-35', 'turma', '${PROF}');

        create function public.sulsafe_gerencia_turma(p_turma_id uuid) returns boolean
        language sql stable security definer set search_path = '' as $$
            select exists (select 1 from public.turmas t
                where t.id = p_turma_id
                  and (t.criado_por = auth.uid() or public.sulsafe_is_admin()))
        $$;

        create table public.turma_materiais (
            id uuid primary key default gen_random_uuid(),
            turma_id uuid not null references public.turmas(id) on delete cascade,
            material_id uuid,
            videoaula_id uuid,
            professor_id uuid not null references public.profiles(id),
            constraint so_um_conteudo check (num_nonnulls(material_id, videoaula_id) = 1)
        );
        create unique index turma_videoaixa on public.turma_materiais (turma_id, videoaula_id)
            where videoaula_id is not null;

        create table public.ia_jobs (
            id uuid primary key,
            empresa_id uuid,
            criado_por uuid not null references public.profiles(id),
            tipo text not null,
            titulo text not null,
            prompt text not null,
            status text not null default 'PENDENTE'
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
            publicado_em timestamptz
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

    await db.exec(materializacao)
    await db.exec(distribuicao)

    await db.query(`
        insert into public.ia_jobs (id, empresa_id, criado_por, tipo, titulo, prompt)
        values ('${JOB}', '${EMP_A}', '${PROF}', 'CURSO', 'Trabalho em altura', 'Pedido')
    `)

    return db
}

async function sessao(db, usuario, empresa) {
    await db.exec('reset role')
    await db.query('update auth.sessao set uid = $1, empresa_id = $2', [usuario, empresa])
}

async function criarRascunho(db) {
    await db.query(`
        insert into public.ia_conteudos
            (id, job_id, empresa_id, criado_por, tipo, titulo, conteudo, aprovado, aprovado_por)
        values ($1, $2, $3, $4, 'CURSO', 'NR-35 — Trabalho em altura',
                $5::jsonb, true, $4)
    `, [CONTEUDO, JOB, EMP_A, PROF, CONTEUDO_IA])
}

test('materialização mantém a ementa completa na descrição', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())

    await criarRascunho(db)
    await sessao(db, PROF, EMP_A)

    await db.query(`
        select public.sulsafe_materializar_rascunho_tutor($1, 35, 'VIDEOAULA')
    `, [CONTEUDO])

    const { rows } = await db.query('select descricao, publico from public.videoaulas')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].publico, false)
    assert.match(rows[0].descricao, /Ementa aprovada/)
    assert.match(rows[0].descricao, /Fundamentos/)
    assert.match(rows[0].descricao, /Responsabilidades — Deveres do empregador/)
})

test('direciona para turma e registra no rascunho', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())

    await criarRascunho(db)
    await sessao(db, PROF, EMP_A)
    await db.query(`select public.sulsafe_materializar_rascunho_tutor($1, 35, 'VIDEOAULA')`, [CONTEUDO])

    await db.query(`
        select public.sulsafe_direcionar_conteudo_tutor($1, ARRAY['${TURMA}']::uuid[])
    `, [CONTEUDO])

    const vinculos = await db.query('select * from public.turma_materiais')
    assert.equal(vinculos.rows.length, 1)
    assert.equal(vinculos.rows[0].turma_id, TURMA)
    assert.equal(vinculos.rows[0].professor_id, PROF)
    assert.ok(vinculos.rows[0].videoaula_id)

    const rascunho = await db.query('select conteudo, publicado from public.ia_conteudos where id = $1', [CONTEUDO])
    assert.equal(rascunho.rows[0].conteudo.materializado_destino, 'TURMA')
    assert.equal(rascunho.rows[0].conteudo.materializado_turmas[0].nome, 'Turma NR-35')
    assert.equal(rascunho.rows[0].publicado, false)

    const videoaula = await db.query('select publico from public.videoaulas')
    assert.equal(videoaula.rows[0].publico, false)
})

test('publicar libera no catálogo e tornar privado reverte', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())

    await criarRascunho(db)
    await sessao(db, PROF, EMP_A)
    await db.query(`select public.sulsafe_materializar_rascunho_tutor($1, 35, 'VIDEOAULA')`, [CONTEUDO])

    await db.query(`select public.sulsafe_publicar_conteudo_tutor($1)`, [CONTEUDO])

    let estado = await db.query(`
        select v.publico, c.publicado, c.conteudo
          from public.videoaulas v, public.ia_conteudos c
         where c.id = $1
    `, [CONTEUDO])
    assert.equal(estado.rows[0].publico, true)
    assert.equal(estado.rows[0].publicado, true)
    assert.equal(estado.rows[0].conteudo.materializado_destino, 'GLOBAL')
    assert.equal(estado.rows[0].conteudo.publicado_por_conteudo, PROF)

    await db.query(`select public.sulsafe_publicar_conteudo_tutor($1, false)`, [CONTEUDO])

    estado = await db.query(`
        select v.publico, c.publicado, c.conteudo
          from public.videoaulas v, public.ia_conteudos c
         where c.id = $1
    `, [CONTEUDO])
    assert.equal(estado.rows[0].publico, false)
    assert.equal(estado.rows[0].publicado, false)
    assert.equal(estado.rows[0].conteudo.materializado_destino, 'INTERNO')
})

test('bloqueia distribuição sem materialização e entre empresas', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())

    await criarRascunho(db)
    await sessao(db, PROF, EMP_A)

    await assert.rejects(
        () => db.query(`select public.sulsafe_publicar_conteudo_tutor($1)`, [CONTEUDO]),
        /Materialize o rascunho antes de publicá-lo/i
    )
    await assert.rejects(
        () => db.query(`select public.sulsafe_direcionar_conteudo_tutor($1, ARRAY['${TURMA}']::uuid[])`, [CONTEUDO]),
        /Materialize o rascunho antes de direcioná-lo/i
    )

    await db.query(`select public.sulsafe_materializar_rascunho_tutor($1, 35, 'VIDEOAULA')`, [CONTEUDO])

    await sessao(db, PROF, EMP_B)
    await assert.rejects(
        () => db.query(`select public.sulsafe_publicar_conteudo_tutor($1)`, [CONTEUDO]),
        /outra empresa/i
    )
    await assert.rejects(
        () => db.query(`select public.sulsafe_direcionar_conteudo_tutor($1, ARRAY['${TURMA}']::uuid[])`, [CONTEUDO]),
        /outra empresa/i
    )
})
