import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const image = process.env.SULSAFE_PG_IMAGE || 'public.ecr.aws/supabase/postgres:17.6.1.147'
const container = `sulsafe-escopo-${process.pid}`

const admin = '00000000-0000-4000-8000-000000000101'
const professorA = '00000000-0000-4000-8000-000000000102'
const professorB = '00000000-0000-4000-8000-000000000103'
const alunoA1 = '00000000-0000-4000-8000-000000000111'
const alunoA2 = '00000000-0000-4000-8000-000000000112'
const alunoB1 = '00000000-0000-4000-8000-000000000113'
const turmaA = '00000000-0000-4000-8000-000000000201'
const turmaB = '00000000-0000-4000-8000-000000000202'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function docker(args, options = {}) {
    return spawnSync('docker', args, { encoding: 'utf8', ...options })
}

function dockerPsql(sql, args = []) {
    return new Promise(resolve => {
        const child = spawn(
            'docker',
            ['exec', '-i', container, 'psql', '-U', 'supabase_admin', '-d', 'postgres', ...args],
            { stdio: ['pipe', 'pipe', 'pipe'] }
        )
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', chunk => { stdout += chunk })
        child.stderr.on('data', chunk => { stderr += chunk })
        child.on('close', code => resolve({ code, stdout, stderr }))
        child.stdin.end(sql)
    })
}

async function applyFile(relativePath) {
    const sql = fs.readFileSync(path.join(root, relativePath), 'utf8')
    const result = await dockerPsql(sql, ['-v', 'ON_ERROR_STOP=1', '-q'])
    if (result.code !== 0) {
        throw new Error(`Falha ao aplicar ${relativePath}:\n${result.stderr}`)
    }
}

function asUser(userId, sql) {
    return dockerPsql(
        `begin;
         set local role authenticated;
         set local request.jwt.claim.sub = '${userId}';
         set local request.jwt.claim.role = 'authenticated';
         ${sql}
         commit;`,
        ['-v', 'ON_ERROR_STOP=1', '-q', '-At']
    )
}

async function expectSuccess(label, userId, sql) {
    const result = await asUser(userId, sql)
    assert.equal(result.code, 0, `${label} deveria ser permitido:\n${result.stderr}`)
}

async function expectDenied(label, userId, sql) {
    const result = await asUser(userId, sql)
    assert.notEqual(result.code, 0, `${label} deveria ser negado`)
    assert.match(
        result.stderr,
        /42501|row-level security|violates row-level security|acesso restrito/i,
        `${label} deveria falhar por autorizacao/RLS:\n${result.stderr}`
    )
}

async function queryAsUser(label, userId, sql) {
    const result = await asUser(userId, sql)
    assert.equal(result.code, 0, `${label} falhou:\n${result.stderr}`)
    return result.stdout.trim()
}

const seedSql = `
set session_replication_role = replica;

insert into public.profiles (id, email, nome_completo, role, status) values
    ('${admin}', 'admin@example.com', 'Admin', 'admin', 'ativo'),
    ('${professorA}', 'professor.a@example.com', 'Professor A', 'professor', 'ativo'),
    ('${professorB}', 'professor.b@example.com', 'Professor B', 'professor', 'ativo'),
    ('${alunoA1}', 'aluno.a1@example.com', 'Aluno A1', 'aluno', 'ativo'),
    ('${alunoA2}', 'aluno.a2@example.com', 'Aluno A2', 'aluno', 'ativo'),
    ('${alunoB1}', 'aluno.b1@example.com', 'Aluno B1', 'aluno', 'ativo')
on conflict (id) do update set
    email = excluded.email,
    nome_completo = excluded.nome_completo,
    role = excluded.role,
    status = excluded.status;

insert into public.turmas (id, nome, criado_por) values
    ('${turmaA}', 'Turma A', '${professorA}'),
    ('${turmaB}', 'Turma B', '${professorB}')
on conflict (id) do nothing;

insert into public.turma_alunos (turma_id, aluno_id) values
    ('${turmaA}', '${alunoA1}'),
    ('${turmaA}', '${alunoA2}'),
    ('${turmaB}', '${alunoB1}')
on conflict do nothing;

set session_replication_role = origin;
`

let started = false

try {
    const dockerInfo = docker(['info'])
    assert.equal(dockerInfo.status, 0, 'Docker precisa estar disponivel para este teste')

    const run = docker([
        'run', '-d', '--rm',
        '--name', container,
        '-e', 'POSTGRES_PASSWORD=postgres',
        image
    ])
    assert.equal(run.status, 0, `Nao foi possivel iniciar o PostgreSQL de teste:\n${run.stderr}`)
    started = true

    for (let attempt = 0; attempt < 60; attempt++) {
        const ready = docker(['exec', container, 'pg_isready', '-U', 'supabase_admin'])
        if (ready.status === 0) break
        if (attempt === 59) throw new Error('PostgreSQL de teste nao ficou pronto.')
        await sleep(1000)
    }

    await sleep(12000)
    await applyFile('supabase/schema-base.sql')

    await dockerPsql(`
        create or replace function auth.jwt()
        returns jsonb language sql stable
        as $$
            select jsonb_build_object(
                'sub', current_setting('request.jwt.claim.sub', true),
                'email', current_setting('request.jwt.claim.email', true),
                'role', current_setting('request.jwt.claim.role', true)
            )
        $$;

        create schema if not exists storage;
        create table if not exists storage.buckets (
            id text primary key,
            name text not null,
            public boolean not null default false,
            file_size_limit bigint,
            allowed_mime_types text[]
        );
        create table if not exists storage.objects (
            id uuid primary key default gen_random_uuid(),
            bucket_id text,
            name text,
            owner uuid,
            metadata jsonb
        );
        alter table storage.objects enable row level security;
        create or replace function storage.foldername(name text)
        returns text[] language sql immutable
        as $$
            select case
                when array_length(string_to_array(name, '/'), 1) > 1
                then (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
                else array[]::text[]
            end
        $$;
        grant usage on schema storage to anon, authenticated, service_role;
        grant select, insert, update, delete on storage.objects to authenticated, service_role;
        grant select on storage.buckets to authenticated, service_role, anon;
    `, ['-v', 'ON_ERROR_STOP=1', '-q'])

    const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
        .filter(file => file.endsWith('.sql'))
        .sort()
    for (const migration of migrations) {
        await applyFile(`supabase/migrations/${migration}`)
    }

    await dockerPsql(`
        insert into auth.users (id, email) values
            ('${admin}', 'admin@example.com'),
            ('${professorA}', 'professor.a@example.com'),
            ('${professorB}', 'professor.b@example.com'),
            ('${alunoA1}', 'aluno.a1@example.com'),
            ('${alunoA2}', 'aluno.a2@example.com'),
            ('${alunoB1}', 'aluno.b1@example.com')
        on conflict (id) do nothing;
    `, ['-v', 'ON_ERROR_STOP=1', '-q'])

    const seed = await dockerPsql(seedSql, ['-v', 'ON_ERROR_STOP=1', '-q'])
    assert.equal(seed.code, 0, `Falha ao preparar dados de teste:\n${seed.stderr}`)

    const provaA1 = '00000000-0000-4000-8000-000000000301'
    const provaB1 = '00000000-0000-4000-8000-000000000302'

    await expectSuccess(
        'professor A cria prova individual para aluno da sua turma',
        professorA,
        `insert into public.provas_direcionadas (id, titulo, aluno_id, criado_por)
         values ('${provaA1}', 'Prova A1', '${alunoA1}', '${professorA}');`
    )

    await expectDenied(
        'professor A nao cria prova individual para aluno de outra turma',
        professorA,
        `insert into public.provas_direcionadas (titulo, aluno_id, criado_por)
         values ('Prova indevida', '${alunoB1}', '${professorA}');`
    )

    await expectSuccess(
        'professor A cria prova para a propria turma',
        professorA,
        `insert into public.provas_direcionadas (titulo, turma_id, criado_por)
         values ('Prova Turma A', '${turmaA}', '${professorA}');`
    )

    await expectDenied(
        'professor A nao cria prova para turma alheia',
        professorA,
        `insert into public.provas_direcionadas (titulo, turma_id, criado_por)
         values ('Prova Turma B', '${turmaB}', '${professorA}');`
    )

    await expectDenied(
        'professor A nao move prova para aluno de outra turma',
        professorA,
        `update public.provas_direcionadas
         set aluno_id = '${alunoB1}'
         where id = '${provaA1}';`
    )

    await expectSuccess(
        'professor A move prova para outro aluno da mesma turma',
        professorA,
        `update public.provas_direcionadas
         set aluno_id = '${alunoA2}'
         where id = '${provaA1}';`
    )

    await expectSuccess(
        'professor A lanca nota para aluno da sua turma',
        professorA,
        `insert into public.notas (usuario_id, nr_id, nota, professor_id)
         values ('${alunoA1}', 10, 9.5, '${professorA}');`
    )

    await expectDenied(
        'professor A nao lanca nota para aluno de outra turma',
        professorA,
        `insert into public.notas (usuario_id, nr_id, nota, professor_id)
         values ('${alunoB1}', 10, 9.5, '${professorA}');`
    )

    await expectSuccess(
        'professor A corrige prova de aluno da sua turma',
        professorA,
        `insert into public.provas (usuario_id, nr_id, titulo, arquivo_url, status)
         values ('${alunoA1}', 10, 'Envio A1', 'https://example.com/a1.pdf', 'pendente');`
    )

    await expectDenied(
        'professor A nao cria prova para aluno de outra turma',
        professorA,
        `insert into public.provas (usuario_id, nr_id, titulo, arquivo_url, status)
         values ('${alunoB1}', 10, 'Envio B1', 'https://example.com/b1.pdf', 'pendente');`
    )

    await expectSuccess(
        'professor A emite certificado para aluno da sua turma',
        professorA,
        `insert into public.certificados (usuario_id, nr_id, nota, emitido_por)
         values ('${alunoA1}', 10, 9.5, '${professorA}');`
    )

    await expectDenied(
        'professor A nao emite certificado para aluno de outra turma',
        professorA,
        `insert into public.certificados (usuario_id, nr_id, nota, emitido_por)
         values ('${alunoB1}', 10, 9.5, '${professorA}');`
    )

    await expectSuccess(
        'professor A consulta perfil de aluno da sua turma',
        professorA,
        `select * from public.sulsafe_obter_perfil_publico('${alunoA1}');`
    )

    await expectDenied(
        'professor A nao consulta perfil de aluno de outra turma',
        professorA,
        `select * from public.sulsafe_obter_perfil_publico('${alunoB1}');`
    )

    const alunosVisiveis = await queryAsUser(
        'consulta de alunos do professor A',
        professorA,
        'select count(*) from public.sulsafe_listar_alunos();'
    )
    assert.equal(alunosVisiveis, '2', 'professor A deve ver apenas os dois alunos da turma A')

    const provaVisivelParaB = await queryAsUser(
        'consulta de prova do professor B',
        professorB,
        `select count(*) from public.provas_direcionadas where id = '${provaA1}';`
    )
    assert.equal(provaVisivelParaB, '0', 'professor B nao pode ver prova individual da turma A')

    await expectSuccess(
        'admin cria prova individual para qualquer aluno',
        admin,
        `insert into public.provas_direcionadas (id, titulo, aluno_id, criado_por)
         values ('${provaB1}', 'Prova B1', '${alunoB1}', '${admin}');`
    )

    const provaVisivelParaAdmin = await queryAsUser(
        'consulta de prova do admin',
        admin,
        `select count(*) from public.provas_direcionadas where id = '${provaA1}';`
    )
    assert.equal(provaVisivelParaAdmin, '1', 'admin deve ver provas direcionadas individuais de terceiros')

    console.log('\nEscopo de professor por turma validado em runtime (RLS e RPCs).')
} finally {
    if (started) docker(['rm', '-f', container])
}
