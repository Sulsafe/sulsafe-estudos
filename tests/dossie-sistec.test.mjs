import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
    DOCUMENTOS_DOSSIE,
    TIPOS_DOCUMENTO_OBRIGATORIOS,
    mascararCpf,
    validarCpf
} from '../js/dossie-constants.js'
import { POSICOES_CERTIFICADO } from '../js/certificado-pdf.js'

const caminho = new URL('../supabase/migrations/20261023100000_dossie_sistec.sql', import.meta.url)
const sql = fs.readFileSync(caminho, 'utf8')
const auditoria = fs.readFileSync(new URL('../js/views/auditoria-dossies.js', import.meta.url), 'utf8')

test('migration adiciona os dados obrigatórios do dossiê SISTEC', () => {
    for (const coluna of [
        'cpf',
        'data_nascimento',
        'cor_raca',
        'renda_per_capita',
        'identidade_genero',
        'tipo_deficiencia',
        'forma_acesso',
        'nome_mae',
        'nacionalidade',
        'sexo',
        'foto_url',
        'dossie_status'
    ]) {
        assert.match(
            sql,
            new RegExp(`add column if not exists ${coluna}\\b`, 'i'),
            `coluna ${coluna} ausente`
        )
    }
})

test('CPF tem índice único parcial e formato de 11 dígitos', () => {
    assert.match(sql, /create unique index if not exists profiles_cpf_uidx\s+on public\.profiles \(cpf\)\s+where cpf is not null/i)
    assert.match(sql, /profiles_cpf_formato_check\s+check \(cpf is null or cpf ~ '\^\[0-9\]\{11\}\$'\)/i)
})

test('documentos_aluno tem chave por aluno/tipo e RLS', () => {
    assert.match(sql, /create table if not exists public\.documentos_aluno/i)
    assert.match(sql, /unique \(aluno_id, tipo_documento\)/i)
    assert.match(sql, /alter table public\.documentos_aluno enable row level security/i)
    assert.match(sql, /create policy "Aluno lê próprios documentos"/i)
    assert.match(sql, /create policy "Admin atualiza documentos"/i)
})

test('bucket documentos-alunos é privado e tem políticas de storage', () => {
    assert.match(sql, /'documentos-alunos'/i)
    assert.match(sql, /insert into storage\.buckets[\s\S]*?false,\s*10485760/i)
    for (const policy of [
        'sulsafe_docs_alunos_select',
        'sulsafe_docs_alunos_insert',
        'sulsafe_docs_alunos_update',
        'sulsafe_docs_alunos_delete'
    ]) {
        assert.match(sql, new RegExp(`create policy "${policy}"`, 'i'))
    }
})

test('RPCs do dossiê usam security definer e search_path vazio', () => {
    for (const fn of [
        'atualizar_meu_dossie',
        'definir_foto_perfil',
        'auditar_dossie',
        'documentos_aluno_auditoria'
    ]) {
        const inicio = sql.indexOf(`create or replace function public.${fn}(`)
        assert.notEqual(inicio, -1, `função ${fn} ausente`)

        const fim = sql.indexOf('as $$', inicio)
        assert.notEqual(fim, -1, `cabeçalho de ${fn} incompleto`)

        const cabecalho = sql.slice(inicio, fim)
        assert.match(cabecalho, /security definer/i)
        assert.match(cabecalho, /set search_path\s*=\s*''/i)
    }
})

test('documento exige caminho na pasta do aluno e grants mínimos', () => {
    assert.match(sql, /arquivo_url not like new\.aluno_id::text \|\| '\/%'/i)
    assert.match(sql, /revoke all on public\.documentos_aluno from anon/i)
    assert.match(sql, /grant select, insert, update, delete on public\.documentos_aluno to authenticated/i)
})

test('migration não contém comandos destrutivos de dados', () => {
    assert.doesNotMatch(sql, /\bdrop\s+table\b/i)
    assert.doesNotMatch(sql, /\btruncate\b/i)
    assert.doesNotMatch(sql, /\bdelete\s+from\b/i)
    assert.doesNotMatch(sql, /\bdrop\s+schema\b/i)
})

test('cinco documentos obrigatórios e validação de CPF', () => {
    assert.deepEqual(TIPOS_DOCUMENTO_OBRIGATORIOS, [
        'FOTO_3X4',
        'RG',
        'CPF',
        'HISTORICO_ESCOLAR',
        'COMPROVANTE_RESIDENCIA'
    ])

    assert.equal(DOCUMENTOS_DOSSIE.length >= 8, true)
    assert.equal(validarCpf('52998224725'), true)
    assert.equal(validarCpf('11111111111'), false)
    assert.equal(validarCpf('123'), false)
    assert.equal(mascararCpf('52998224725'), '529.982.247-25')
})

test('gerador de certificado usa o modelo aprovado e campos dinâmicos', () => {
    const frente = POSICOES_CERTIFICADO.frente
    const fonte = fs.readFileSync(
        new URL('../js/certificado-pdf.js', import.meta.url),
        'utf8'
    )

    assert.match(fonte, /certificado-base\.png/)

    for (const campo of ['nome', 'curso', 'periodo', 'conteudo', 'assinaturas', 'meta']) {
        assert.ok(frente[campo], `campo ${campo} ausente`)
    }

    assert.equal(frente.conteudo.itens.length, 8)

    for (const pos of [frente.nome, frente.curso, frente.cargaHoraria, frente.meta]) {
        assert.equal(Number.isFinite(pos.x), true)
        assert.equal(Number.isFinite(pos.y), true)
    }

    for (const assinatura of Object.values(frente.assinaturas)) {
        assert.equal(Number.isFinite(assinatura.x), true)
        assert.equal(Number.isFinite(assinatura.y), true)
        assert.equal(assinatura.maxWidth > 0, true)
    }
})

test('auditoria permite admin editar a ficha e anexar documentos', () => {
    assert.match(auditoria, /Editar Ficha/)
    assert.match(auditoria, /Anexar Documento/)
    assert.match(auditoria, /window\.salvarDossieAdmin/)
    assert.match(auditoria, /window\.enviarDocumentoAdmin/)
    assert.match(auditoria, /sbAdminSalvarDossie/)
    assert.match(auditoria, /sbUploadDocumentoAluno/)
})
