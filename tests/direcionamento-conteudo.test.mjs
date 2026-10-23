import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const caminho = new URL('../supabase/migrations/20261022000000_direcionamento_conteudo.sql', import.meta.url)
const sql = fs.readFileSync(caminho, 'utf8')

test('migration cria tabelas de turmas, alunos, conteúdos e provas direcionadas', () => {
    for (const tabela of ['turmas', 'turma_alunos', 'turma_materiais', 'provas_direcionadas']) {
        assert.match(sql, new RegExp(`create table if not exists public\\.${tabela}`, 'i'), `tabela ${tabela} ausente`)
    }
})

test('conteúdo antigo permanece global por padrão', () => {
    assert.match(sql, /alter table public\.materiais\s+add column if not exists publico boolean not null default true/i)
    assert.match(sql, /alter table public\.videoaulas\s+add column if not exists publico boolean not null default true/i)
})

test('RLS é habilitada nas novas tabelas', () => {
    for (const tabela of ['turmas', 'turma_alunos', 'turma_materiais', 'provas_direcionadas']) {
        assert.match(sql, new RegExp(`alter table public\\.${tabela} enable row level security`, 'i'))
    }
})

test('aluno só acessa conteúdo de turma em que está inscrito', () => {
    assert.match(sql, /create policy "sulsafe_turma_materiais_select"/i)
    assert.match(sql, /from public\.turma_alunos ta\s+where ta\.turma_id = turma_materiais\.turma_id\s+and ta\.aluno_id = auth\.uid\(\)/i)
    assert.match(sql, /create policy "sulsafe_materiais_direcionamento"[\s\S]*?as restrictive[\s\S]*?to anon, authenticated[\s\S]*?publico = true[\s\S]*?tm\.material_id = materiais\.id/i)
    assert.match(sql, /create policy "sulsafe_videoaulas_direcionamento"[\s\S]*?as restrictive[\s\S]*?to anon, authenticated[\s\S]*?publico = true[\s\S]*?tm\.videoaula_id = videoaulas\.id/i)
})

test('aluno só vê provas direcionadas publicadas', () => {
    assert.match(sql, /create policy "sulsafe_provas_direcionadas_select"[\s\S]*?publicado = true[\s\S]*?aluno_id = auth\.uid\(\)[\s\S]*?ta\.turma_id = provas_direcionadas\.turma_id/i)
})

test('provas direcionadas exigem exatamente um destino', () => {
    assert.match(sql, /constraint provas_direcionadas_um_destino_check\s+check \(num_nonnulls\(turma_id, aluno_id\) = 1\)/i)
    assert.match(sql, /constraint turma_materiais_um_conteudo_check\s+check \(num_nonnulls\(material_id, videoaula_id\) = 1\)/i)
})

test('helpers de autorização usam security definer e search_path vazio', () => {
    for (const fn of ['sulsafe_is_admin', 'sulsafe_is_professor', 'sulsafe_gerencia_turma']) {
        const inicio = sql.indexOf(`create or replace function public.${fn}(`)
        assert.notEqual(inicio, -1, `função ${fn} ausente`)
        const fim = sql.indexOf('as $$', inicio)
        assert.notEqual(fim, -1, `cabeçalho de ${fn} incompleto`)
        const cabecalho = sql.slice(inicio, fim)
        assert.match(cabecalho, /security definer/i)
        assert.match(cabecalho, /set search_path\s*=\s*''/i)
    }
})

test('migration não contém comandos destrutivos de dados', () => {
    assert.doesNotMatch(sql, /\bdrop\s+table\b/i)
    assert.doesNotMatch(sql, /\btruncate\b/i)
    assert.doesNotMatch(sql, /\bdelete\s+from\b/i)
    assert.doesNotMatch(sql, /\bdrop\s+schema\b/i)
})
