import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = caminho => fs.readFileSync(new URL(caminho, import.meta.url), 'utf8')
const sql = ler('../supabase/migrations/20261025000002_escopo_professor_turmas.sql')

test('helpers de escopo exigem professor ativo e vinculo com a turma', () => {
    for (const fn of ['sulsafe_acessa_turma', 'sulsafe_acessa_aluno']) {
        const inicio = sql.indexOf(`create or replace function public.${fn}(`)
        assert.notEqual(inicio, -1, `funcao ${fn} ausente`)
        const fim = sql.indexOf('as $$', inicio)
        assert.notEqual(fim, -1, `cabecalho de ${fn} incompleto`)
        const cabecalho = sql.slice(inicio, fim)
        assert.match(cabecalho, /security definer/i)
        assert.match(cabecalho, /set search_path\s*=\s*''/i)
    }

    assert.match(sql, /t\.criado_por = auth\.uid\(\)/)
    assert.match(sql, /tm\.professor_id = auth\.uid\(\)/)
    assert.match(
        sql,
        /ta\.aluno_id = p_aluno_id[\s\S]*?public\.sulsafe_acessa_turma\(ta\.turma_id\)/
    )
    assert.match(sql, /revoke all on function public\.sulsafe_acessa_turma\(uuid\) from public, anon/i)
    assert.match(sql, /revoke all on function public\.sulsafe_acessa_aluno\(uuid\) from public, anon/i)
})

test('RPCs de leitura filtram alunos e provas pela turma do professor', () => {
    assert.match(
        sql,
        /sulsafe_listar_alunos[\s\S]*?public\.sulsafe_acessa_aluno\(p\.id\)/
    )
    assert.match(
        sql,
        /sulsafe_obter_perfil_publico[\s\S]*?v_acessa_aluno := public\.sulsafe_acessa_aluno\(p_id\)/
    )
    assert.match(
        sql,
        /sulsafe_listar_provas_pendentes[\s\S]*?public\.sulsafe_acessa_aluno\(pr\.usuario_id\)/
    )
    assert.match(sql, /revoke all on function public\.sulsafe_listar_alunos\(\) from public, anon/i)
    assert.match(sql, /revoke all on function public\.sulsafe_obter_perfil_publico\(uuid\) from public, anon/i)
    assert.match(sql, /revoke all on function public\.sulsafe_listar_provas_pendentes\(\) from public, anon/i)
})

test('notas, provas e certificados usam o escopo por aluno', () => {
    for (const policy of [
        'sulsafe_notas_select',
        'sulsafe_notas_insert',
        'sulsafe_notas_update',
        'sulsafe_notas_delete',
        'sulsafe_provas_select',
        'sulsafe_provas_insert',
        'sulsafe_provas_update',
        'sulsafe_certificados_select',
        'sulsafe_certificados_insert',
        'sulsafe_certificados_update'
    ]) {
        const inicio = sql.indexOf(`create policy "${policy}"`)
        assert.notEqual(inicio, -1, `policy ${policy} ausente`)
        const fim = sql.indexOf(';', inicio)
        const bloco = sql.slice(inicio, fim)
        assert.match(bloco, /sulsafe_acessa_aluno\(usuario_id\)/i, `${policy} deve usar o escopo por aluno`)
        assert.doesNotMatch(bloco, /sulsafe_is_professor\(\)/i, `${policy} nao pode liberar todos os professores`)
    }
})

test('turmas e provas direcionadas usam o escopo por turma', () => {
    for (const policy of [
        'sulsafe_turmas_select',
        'sulsafe_turma_alunos_select',
        'sulsafe_turma_materiais_select',
        'sulsafe_provas_direcionadas_select'
    ]) {
        const inicio = sql.indexOf(`create policy "${policy}"`)
        assert.notEqual(inicio, -1, `policy ${policy} ausente`)
        const fim = sql.indexOf(';', inicio)
        const bloco = sql.slice(inicio, fim)
        assert.match(bloco, /sulsafe_acessa_turma\(/i, `${policy} deve usar o escopo por turma`)
    }

    const select = sql.slice(
        sql.indexOf('create policy "sulsafe_provas_direcionadas_select"'),
        sql.indexOf(';', sql.indexOf('create policy "sulsafe_provas_direcionadas_select"'))
    )
    assert.match(select, /public\.sulsafe_is_admin\(\)/i, 'admin deve manter leitura ampla de provas direcionadas')
})

test('insercao e atualizacao de provas direcionadas validam o destino', () => {
    for (const policy of [
        'sulsafe_provas_direcionadas_insert',
        'sulsafe_provas_direcionadas_update'
    ]) {
        const inicio = sql.indexOf(`create policy "${policy}"`)
        assert.notEqual(inicio, -1, `policy ${policy} ausente`)
        const fim = sql.indexOf(';', inicio)
        const bloco = sql.slice(inicio, fim)

        assert.match(bloco, /sulsafe_acessa_aluno\(aluno_id\)/i, `${policy} deve validar aluno no escopo`)
        assert.match(bloco, /sulsafe_perfil_aluno\(aluno_id\)/i, `${policy} deve validar que o destino e aluno`)
        assert.match(bloco, /sulsafe_acessa_turma\(turma_id\)/i, `${policy} deve validar turma no escopo`)
    }
})

test('exclusao de prova direcionada fica restrita ao criador ou admin', () => {
    const inicio = sql.indexOf('create policy "sulsafe_provas_direcionadas_delete"')
    assert.notEqual(inicio, -1, 'policy de exclusao ausente')
    const bloco = sql.slice(inicio, sql.indexOf(';', inicio))
    assert.match(bloco, /public\.sulsafe_is_admin\(\)/i)
    assert.match(bloco, /criado_por = auth\.uid\(\)/i)
})

test('migration de escopo nao contem comandos destrutivos', () => {
    assert.doesNotMatch(sql, /\b(drop table|truncate|delete from public\.)/i)
})
