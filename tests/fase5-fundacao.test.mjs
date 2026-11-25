import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const fundacao = fs.readFileSync(
    new URL('../supabase/migrations/20261125000000_fase5_fundacao.sql', import.meta.url),
    'utf8'
)

const ADMIN = '00000000-0000-4000-8000-0000000000d1'
const PROF_A = '00000000-0000-4000-8000-0000000000d2'
const PROF_B = '00000000-0000-4000-8000-0000000000d3'
const ALUNO_A = '00000000-0000-4000-8000-0000000000d4'
const ALUNO_B = '00000000-0000-4000-8000-0000000000d5'
const EMP_A = '00000000-0000-4000-8000-0000000000e1'
const EMP_B = '00000000-0000-4000-8000-0000000000e2'
const JOB_A = '00000000-0000-4000-8000-0000000000f1'
const JOB_B = '00000000-0000-4000-8000-0000000000f2'
const CONTEUDO_A = '00000000-0000-4000-8000-0000000000a1'
const CONTEUDO_A_RASCUNHO = '00000000-0000-4000-8000-0000000000a2'
const CONTEUDO_B = '00000000-0000-4000-8000-0000000000a3'
const CONTEUDO_A2 = '00000000-0000-4000-8000-0000000000a4'
const CONTEUDO_A3 = '00000000-0000-4000-8000-0000000000a5'
const CONTEUDO_A4 = '00000000-0000-4000-8000-0000000000a6'
const TURMA_A = '00000000-0000-4000-8000-0000000000b1'
const MOD_INTERNO = '00000000-0000-4000-8000-0000000000c1'
const MOD_ALUNO = '00000000-0000-4000-8000-0000000000c2'
const MOD_TURMA = '00000000-0000-4000-8000-0000000000c3'
const MOD_CATALOGO = '00000000-0000-4000-8000-0000000000c4'
const MOD_EMP_B = '00000000-0000-4000-8000-0000000000c5'

async function criarBanco() {
    const db = new PGlite()

    await db.exec(`
        create role anon;
        create role authenticated;
        create role service_role;

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

        grant usage on schema auth, public to authenticated, anon;
        grant execute on function auth.uid() to authenticated, anon;
        grant execute on function auth.jwt() to authenticated, anon;

        create table public.profiles (id uuid primary key, role text, status text);
        insert into public.profiles (id, role, status) values
            ('${ADMIN}', 'admin', 'ativo'),
            ('${PROF_A}', 'professor', 'ativo'),
            ('${PROF_B}', 'professor', 'ativo'),
            ('${ALUNO_A}', 'aluno', 'ativo'),
            ('${ALUNO_B}', 'aluno', 'ativo');

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

        grant execute on function public.sulsafe_conta_ativa() to authenticated, anon;
        grant execute on function public.sulsafe_empresa_id() to authenticated, anon;
        grant execute on function public.sulsafe_is_admin() to authenticated, anon;
        grant execute on function public.sulsafe_is_professor() to authenticated, anon;

        create table public.turmas (
            id uuid primary key,
            nome text not null,
            criado_por uuid not null references public.profiles(id)
        );
        insert into public.turmas (id, nome, criado_por)
        values ('${TURMA_A}', 'Turma NR-35', '${PROF_A}');

        create table public.turma_alunos (
            turma_id uuid not null references public.turmas(id) on delete cascade,
            aluno_id uuid not null references public.profiles(id) on delete cascade,
            primary key (turma_id, aluno_id)
        );
        insert into public.turma_alunos (turma_id, aluno_id)
        values ('${TURMA_A}', '${ALUNO_A}');

        create function public.sulsafe_gerencia_turma(p_turma_id uuid) returns boolean
        language sql stable security definer set search_path = '' as $$
            select exists (select 1 from public.turmas t
                where t.id = p_turma_id
                  and (t.criado_por = auth.uid() or public.sulsafe_is_admin()))
        $$;
        grant execute on function public.sulsafe_gerencia_turma(uuid) to authenticated, anon;

        create table public.ia_jobs (
            id uuid primary key,
            empresa_id uuid,
            criado_por uuid not null references public.profiles(id),
            tipo text not null constraint ia_jobs_tipo_check
                check (tipo in ('MATERIA', 'CURSO', 'PALESTRA', 'AVALIACAO', 'MATERIAL')),
            titulo text not null,
            prompt text not null
        );

        create table public.ia_conteudos (
            id uuid primary key,
            job_id uuid not null references public.ia_jobs(id),
            empresa_id uuid,
            criado_por uuid not null references public.profiles(id),
            tipo text not null constraint ia_conteudos_tipo_check
                check (tipo in ('MATERIA', 'CURSO', 'MODULO', 'AULA', 'QUESTAO', 'PALESTRA', 'MATERIAL')),
            titulo text not null,
            conteudo jsonb not null default '{}'::jsonb,
            aprovado boolean not null default false,
            aprovado_por uuid references public.profiles(id),
            rejeitado boolean not null default false,
            publicado boolean not null default false
        );

        create table public.provas_direcionadas (
            id uuid primary key default gen_random_uuid(),
            titulo text not null,
            publicado boolean not null default true,
            origem text not null default 'MANUAL'
                check (origem in ('MANUAL', 'IA_TUTOR')),
            criado_por uuid not null references public.profiles(id)
        );

        grant select on public.ia_conteudos, public.turmas, public.turma_alunos, public.profiles
            to authenticated;
    `)

    // Dados anteriores à migration: uma prova manual legítima e uma prova de IA
    // que ficou publicada indevidamente.
    await db.query(`
        insert into public.provas_direcionadas (id, titulo, publicado, origem, criado_por)
        values
            ('00000000-0000-4000-8000-000000000091', 'Prova manual publicada', true, 'MANUAL', '${PROF_A}'),
            ('00000000-0000-4000-8000-000000000092', 'Prova IA publicada indevidamente', true, 'IA_TUTOR', '${PROF_A}')
    `)

    await db.exec(fundacao)

    await db.query(`
        insert into public.ia_jobs (id, empresa_id, criado_por, tipo, titulo, prompt) values
            ('${JOB_A}', '${EMP_A}', '${PROF_A}', 'MODULO', 'Módulo NR-35', 'Pedido A'),
            ('${JOB_B}', '${EMP_B}', '${PROF_B}', 'MODULO', 'Módulo NR-35', 'Pedido B')
    `)

    await db.query(`
        insert into public.ia_conteudos
            (id, job_id, empresa_id, criado_por, tipo, titulo, aprovado, aprovado_por)
        values
            ('${CONTEUDO_A}', '${JOB_A}', '${EMP_A}', '${PROF_A}', 'MODULO', 'Aprovado A', true, '${PROF_A}'),
            ('${CONTEUDO_A_RASCUNHO}', '${JOB_A}', '${EMP_A}', '${PROF_A}', 'MODULO', 'Rascunho A', false, null),
            ('${CONTEUDO_A2}', '${JOB_A}', '${EMP_A}', '${PROF_A}', 'MODULO', 'Aprovado A2', true, '${PROF_A}'),
            ('${CONTEUDO_A3}', '${JOB_A}', '${EMP_A}', '${PROF_A}', 'MODULO', 'Aprovado A3', true, '${PROF_A}'),
            ('${CONTEUDO_A4}', '${JOB_A}', '${EMP_A}', '${PROF_A}', 'MODULO', 'Aprovado A4', true, '${PROF_A}'),
            ('${CONTEUDO_B}', '${JOB_B}', '${EMP_B}', '${PROF_B}', 'MODULO', 'Aprovado B', true, '${PROF_B}')
    `)

    return db
}

async function sessao(db, usuario, empresa, papel = 'authenticated') {
    await db.exec('reset role')
    await db.query('update auth.sessao set uid = $1, empresa_id = $2', [usuario, empresa])
    if (papel) await db.exec(`set role ${papel}`)
}

async function criarModulo(db, id, conteudoId, destino, extras = {}) {
    await db.query(`
        insert into public.modulos_direcionados
            (id, ia_conteudo_id, titulo, nr_id, destino, turma_id, aluno_id, publico, criado_por, distribuido_por, distribuido_em)
        values
            ($1, $2, 'Módulo ' || $3, 35, $3, $4, $5, $6, '${PROF_A}', $7, $8)
    `, [
        id,
        conteudoId,
        destino,
        extras.turmaId || null,
        extras.alunoId || null,
        extras.publico ?? false,
        extras.publico ? PROF_A : null,
        extras.publico ? new Date('2026-11-25T12:00:00Z').toISOString() : null
    ])
}

test('provas direcionadas nascem privadas e só provas de I.A. são corrigidas', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())

    const { rows } = await db.query(`
        select titulo, publicado, origem from public.provas_direcionadas order by titulo
    `)

    const manual = rows.find(row => row.titulo === 'Prova manual publicada')
    const ia = rows.find(row => row.titulo === 'Prova IA publicada indevidamente')
    assert.equal(manual.publicado, true, 'prova manual legítima não pode ser recolhida')
    assert.equal(manual.origem, 'MANUAL')
    assert.equal(ia.publicado, false, 'prova de I.A. publicada indevidamente deve ser corrigida')
    assert.equal(ia.origem, 'IA_TUTOR')

    await db.query(`
        insert into public.provas_direcionadas (titulo, criado_por)
        values ('Prova nova sem publicado explícito', '${PROF_A}')
    `)
    const nova = await db.query(`
        select publicado from public.provas_direcionadas
         where titulo = 'Prova nova sem publicado explícito'
    `)
    assert.equal(nova.rows[0].publicado, false)
})

test('checks aceitam PROVA e MODULO sem perder os tipos atuais', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())

    await db.query(`
        insert into public.ia_jobs (id, empresa_id, criado_por, tipo, titulo, prompt) values
            ('00000000-0000-4000-8000-000000000991', '${EMP_A}', '${PROF_A}', 'PROVA', 'Prova I.A.', 'Pedido'),
            ('00000000-0000-4000-8000-000000000992', '${EMP_A}', '${PROF_A}', 'MODULO', 'Módulo I.A.', 'Pedido'),
            ('00000000-0000-4000-8000-000000000993', '${EMP_A}', '${PROF_A}', 'PALESTRA', 'Palestra I.A.', 'Pedido')
    `)

    await db.query(`
        insert into public.ia_conteudos
            (id, job_id, empresa_id, criado_por, tipo, titulo)
        values
            ('00000000-0000-4000-8000-000000000981',
             '00000000-0000-4000-8000-000000000991', '${EMP_A}', '${PROF_A}', 'PROVA', 'Prova I.A.')
    `)

    await assert.rejects(
        () => db.query(`
            insert into public.ia_jobs (id, empresa_id, criado_por, tipo, titulo, prompt)
            values ('00000000-0000-4000-8000-000000000994', '${EMP_A}', '${PROF_A}', 'TIPO_INVALIDO', 'X', 'Y')
        `),
        /ia_jobs_tipo_check|violates check constraint/i
    )
})

test('módulos direcionados nascem internos e respeitam destino e HITL', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())

    await criarModulo(db, MOD_INTERNO, CONTEUDO_A, 'INTERNO')

    const { rows } = await db.query('select publico, destino, origem from public.modulos_direcionados')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].publico, false)
    assert.equal(rows[0].destino, 'INTERNO')
    assert.equal(rows[0].origem, 'IA_TUTOR')

    await assert.rejects(
        () => criarModulo(db, '00000000-0000-4000-8000-0000000000c9', CONTEUDO_A, 'TURMA'),
        /modulos_direcionados_destino_check|violates check constraint/i
    )

    await assert.rejects(
        () => criarModulo(db, '00000000-0000-4000-8000-0000000000c8', CONTEUDO_A_RASCUNHO, 'CATALOGO', { publico: true }),
        /Aprove o rascunho antes de tornar o módulo público/i
    )
})

test('RLS isola módulos por empresa e só mostra ao aluno o que foi distribuído', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())

    await criarModulo(db, MOD_INTERNO, CONTEUDO_A, 'INTERNO')
    await criarModulo(db, MOD_ALUNO, CONTEUDO_A2, 'ALUNO', { alunoId: ALUNO_A, publico: true })
    await criarModulo(db, MOD_TURMA, CONTEUDO_A3, 'TURMA', { turmaId: TURMA_A, publico: true })
    await criarModulo(db, MOD_CATALOGO, CONTEUDO_A4, 'CATALOGO', { publico: true })
    await criarModulo(db, MOD_EMP_B, CONTEUDO_B, 'CATALOGO', { publico: true })

    async function visiveis(usuario, empresa) {
        await sessao(db, usuario, empresa)
        const { rows } = await db.query('select id from public.modulos_direcionados order by id')
        return rows.map(row => row.id)
    }

    const professorA = await visiveis(PROF_A, EMP_A)
    assert.ok(professorA.includes(MOD_INTERNO))
    assert.ok(professorA.includes(MOD_ALUNO))
    assert.ok(!professorA.includes(MOD_EMP_B), 'professor não vê módulo de outra empresa')

    const alunoA = await visiveis(ALUNO_A, EMP_A)
    assert.ok(alunoA.includes(MOD_ALUNO), 'aluno vê módulo direcionado a ele')
    assert.ok(alunoA.includes(MOD_TURMA), 'aluno vê módulo da sua turma')
    assert.ok(alunoA.includes(MOD_CATALOGO), 'aluno vê catálogo')
    assert.ok(!alunoA.includes(MOD_INTERNO), 'aluno não vê rascunho interno')
    assert.ok(!alunoA.includes(MOD_EMP_B), 'aluno não vê módulo de outra empresa')

    const alunoB = await visiveis(ALUNO_B, EMP_B)
    assert.deepEqual(alunoB, [MOD_EMP_B], 'aluno B vê apenas o catálogo da sua empresa')
})
