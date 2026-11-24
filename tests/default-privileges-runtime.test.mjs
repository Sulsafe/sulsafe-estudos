import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const sql = fs.readFileSync(
    new URL('../supabase/migrations/20261124000000_endurece_default_privileges.sql', import.meta.url),
    'utf8'
)

test('migration é aplicável e tabelas futuras não herdam acesso anônimo', async (t) => {
    const db = new PGlite()
    t.after(() => db.close())

    await db.exec(`
        create role anon nologin;
        create role authenticated nologin;
        create role service_role nologin bypassrls;
    `)

    await db.exec(sql)

    // Cria um objeto novo exatamente como uma migration futura faria.
    await db.exec('create table public.tabela_futura (id text primary key, segredo text);')

    const resultado = await db.query(`
        select rolname,
               has_table_privilege(rolname, 'public.tabela_futura', 'SELECT') as le,
               has_table_privilege(rolname, 'public.tabela_futura', 'INSERT') as ins
        from pg_roles
        where rolname in ('anon', 'authenticated', 'service_role')
        order by rolname
    `)

    const permissoes = Object.fromEntries(resultado.rows.map(row => [row.rolname, row]))

    assert.equal(permissoes.anon.le, false, 'anon não pode ler tabela nova')
    assert.equal(permissoes.anon.ins, false, 'anon não pode inserir em tabela nova')
    assert.equal(permissoes.authenticated.le, false, 'authenticated não herda leitura')
    assert.equal(permissoes.authenticated.ins, false, 'authenticated não herda INSERT')
    assert.equal(permissoes.service_role.le, true, 'service_role mantém acesso operacional')
    assert.equal(permissoes.service_role.ins, true, 'service_role mantém INSERT')
})
