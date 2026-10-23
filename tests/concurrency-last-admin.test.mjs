import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const image = process.env.SULSAFE_PG_IMAGE || 'public.ecr.aws/supabase/postgres:17.6.1.147'
const container = `sulsafe-concurrency-${process.pid}`
const admin1 = '00000000-0000-4000-8000-000000000021'
const admin2 = '00000000-0000-4000-8000-000000000022'

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

function query(sql) {
    const result = dockerPsqlSync(sql)
    if (result.error) throw result.error
    if (result.status !== 0) {
        throw new Error(`Consulta falhou (exit ${result.status}): ${result.stderr || result.stdout}`)
    }
    return result.stdout.trim()
}

function dockerPsqlSync(sql) {
    return docker(
        ['exec', container, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-Atc', sql]
    )
}

async function applyFile(relativePath) {
    const sql = fs.readFileSync(path.join(root, relativePath), 'utf8')
    const result = await dockerPsql(sql, ['-v', 'ON_ERROR_STOP=1', '-q'])
    if (result.code !== 0) {
        throw new Error(`Falha ao aplicar ${relativePath}:\n${result.stderr}`)
    }
}

const resetSql = `
set session_replication_role = replica;
insert into public.profiles (id, email, nome_completo, role, status) values
 ('${admin1}', 'admin1@example.com', 'Admin Um', 'admin', 'ativo'),
 ('${admin2}', 'admin2@example.com', 'Admin Dois', 'super_admin', 'ativo')
on conflict (id) do update set role = excluded.role, status = excluded.status;
set session_replication_role = origin;
`

const claims = `
set local request.jwt.claim.sub = '${admin2}';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.email = 'admin2@example.com';
`

const scenarios = {
    'dois rebaixamentos': {
        a: `update public.profiles set role = 'aluno' where id = '${admin1}';`,
        b: `update public.profiles set role = 'aluno' where id = '${admin2}';`
    },
    'rebaixamento e exclusao': {
        a: `update public.profiles set role = 'aluno' where id = '${admin1}';`,
        b: `delete from public.profiles where id = '${admin2}';`
    },
    'duas exclusoes': {
        a: `delete from public.profiles where id = '${admin1}';`,
        b: `delete from public.profiles where id = '${admin2}';`
    }
}

async function resetProfiles() {
    const result = await dockerPsql(resetSql, ['-v', 'ON_ERROR_STOP=1', '-q'])
    if (result.code !== 0) throw new Error(`Falha ao resetar perfis:\n${result.stderr}`)
}

async function waitForAdvisoryLock() {
    for (let attempt = 0; attempt < 80; attempt++) {
        await sleep(100)
        const count = Number(query("select count(*) from pg_locks where locktype = 'advisory' and granted"))
        if (count > 0) return
    }
    throw new Error('A primeira transacao nao adquiriu o advisory lock dentro do tempo esperado.')
}

async function runScenario(name, scenario, isolation) {
    await resetProfiles()

    const aSql = `begin isolation level ${isolation};\n${claims}\n${scenario.a}\nselect pg_sleep(4);\ncommit;\n`
    const bSql = `begin isolation level ${isolation};\n${claims}\n${scenario.b}\ncommit;\n`

    const a = dockerPsql(aSql, ['-v', 'ON_ERROR_STOP=1'])
    await waitForAdvisoryLock()

    const b = dockerPsql(bSql, ['-v', 'ON_ERROR_STOP=1'])
    const [resultA, resultB] = await Promise.all([a, b])

    const activeAdmins = Number(
        query("select count(*) from public.profiles where role::text in ('admin', 'super_admin') and status = 'ativo'")
    )

    console.log(`\n[${name} / ${isolation}]`)
    console.log(`  A: exit ${resultA.code}`)
    console.log(`  B: exit ${resultB.code} ${resultB.stderr.trim().split('\n')[0] || ''}`)
    console.log(`  admins ativos restantes: ${activeAdmins}`)

    assert.equal(resultA.code, 0, 'a primeira operacao deveria concluir')
    assert.notEqual(resultB.code, 0, 'a segunda operacao concorrente deveria ser bloqueada')
    assert.ok(activeAdmins >= 1, 'o sistema nao pode ficar sem administrador ativo')
}

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

    // A imagem Supabase reinicia o servidor depois do init inicial. Aplicar DDL
    // durante essa janela dispara event triggers com OIDs da instancia anterior.
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

    const funcoesSensiveis = [
        'atualizar_meu_dossie',
        'definir_foto_perfil',
        'auditar_dossie',
        'sulsafe_existe_outro_admin',
        'is_almox_admin',
        'almox_assert_admin',
        'sulsafe_acessa_turma',
        'sulsafe_acessa_aluno',
        'sulsafe_listar_alunos',
        'sulsafe_obter_perfil_publico',
        'sulsafe_listar_provas_pendentes'
    ]
    const anonExecuta = query(`
        select coalesce(bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')), false)::text
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in (${funcoesSensiveis.map(name => `'${name}'`).join(', ')})
    `)
    assert.equal(anonExecuta, 'false', 'anon nao pode executar funcoes sensiveis')

    const authenticatedExecuta = query(`
        select coalesce(bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')), false)::text
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in (${funcoesSensiveis.map(name => `'${name}'`).join(', ')})
    `)
    assert.equal(authenticatedExecuta, 'true', 'authenticated deve executar as RPCs auditadas')

    await dockerPsql(`
        insert into auth.users (id, email) values
            ('${admin1}', 'admin1@example.com'),
            ('${admin2}', 'admin2@example.com')
        on conflict (id) do nothing;
    `, ['-v', 'ON_ERROR_STOP=1', '-q'])
    await resetProfiles()

    for (const [name, scenario] of Object.entries(scenarios)) {
        for (const isolation of ['read committed', 'repeatable read']) {
            await runScenario(name, scenario, isolation)
        }
    }

    console.log('\nTodos os cenarios concorrentes preservaram ao menos um administrador ativo.')
} finally {
    if (started) docker(['rm', '-f', container])
}
