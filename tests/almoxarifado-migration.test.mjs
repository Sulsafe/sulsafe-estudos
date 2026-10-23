
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const caminho = new URL('../supabase/migrations/20261021000000_almoxarifado.sql', import.meta.url)
const sql = fs.readFileSync(caminho, 'utf8')
const endurecimento = fs.readFileSync(
    new URL('../supabase/migrations/20261025000001_almox_admin_status.sql', import.meta.url),
    'utf8'
)

test('migration cria as tabelas do Almoxarifado', () => {
    for (const tabela of ['almox_categorias', 'almox_fornecedores', 'almox_itens', 'almox_lotes', 'almox_movimentacoes']) {
        assert.match(sql, new RegExp(`create table if not exists public\\.${tabela}`, 'i'), `tabela ${tabela} ausente`)
    }
})

test('migration habilita RLS nas tabelas do módulo', () => {
    const total = (sql.match(/enable row level security/gi) || []).length
    assert.ok(total >= 5, 'RLS deve ser habilitada nas cinco tabelas')
})

test('movimentações e lotes são somente leitura para authenticated', () => {
    assert.match(sql, /revoke all on public\.almox_movimentacoes from authenticated/i)
    assert.match(sql, /grant select on public\.almox_movimentacoes to authenticated/i)
    assert.match(sql, /revoke all on public\.almox_lotes from authenticated/i)
    assert.match(sql, /grant select on public\.almox_lotes to authenticated/i)
})

test('operações de estoque existem como RPC transacional', () => {
    for (const fn of [
        'almox_registrar_entrada',
        'almox_registrar_saida',
        'almox_registrar_ajuste',
        'almox_transferir',
        'almox_estornar_movimentacao'
    ]) {
        assert.match(sql, new RegExp(`create or replace function public\\.${fn}`, 'i'))
        assert.match(sql, new RegExp(`grant execute on function public\\.${fn}`, 'i'))
    }
})

test('gatilhos protegem saldo e lotes pela propriedade da tabela', () => {
    const protecoes = [
        {
            nome: 'almox_protect_item_stock',
            tabela: 'public.almox_itens',
            campo: 'saldo_atual'
        },
        {
            nome: 'almox_protect_item_insert',
            tabela: 'public.almox_itens',
            campo: 'saldo_atual'
        },
        {
            nome: 'almox_protect_lot_quantity',
            tabela: 'public.almox_lotes',
            campo: 'quantidade_atual'
        }
    ]

    for (const protecao of protecoes) {
        const expressao = new RegExp(
            `create or replace function public\\.${protecao.nome}\\s*\\(\\)([\\s\\S]*?)\\$\\$;`,
            'i'
        )
        const resultado = sql.match(expressao)

        assert.ok(resultado, `função ${protecao.nome} ausente`)
        assert.match(resultado[1], /current_user\s*<>\s*pg_catalog\.pg_get_userbyid/i)
        assert.match(resultado[1], new RegExp(protecao.tabela.replaceAll('.', '\\.'), 'i'))
        assert.doesNotMatch(resultado[1], /current_setting\s*\(\s*'almox\.internal_movement'/i)
    }

    assert.match(sql, /almox_block_movement_mutation/i)
})

test('almox_itens não concede INSERT ou UPDATE amplos', () => {
    assert.match(
        sql,
        /revoke insert,\s*update on public\.almox_itens from authenticated/i
    )

    assert.doesNotMatch(
        sql,
        /grant\s+select\s*,\s*insert\s*,\s*update\s*,\s*delete\s+on public\.almox_itens to authenticated/i
    )

    assert.match(sql, /grant select, delete on public\.almox_itens to authenticated/i)
})

test('permissões por coluna excluem saldo e campos de auditoria', () => {
    const grants = sql.match(
        /grant (?:insert|update) \([\s\S]*?\) on public\.almox_itens to authenticated;/gi
    ) || []

    assert.equal(grants.length, 2, 'esperados grants separados para INSERT e UPDATE')

    for (const grant of grants) {
        assert.doesNotMatch(grant, /\bsaldo_atual\b/i)
        assert.doesNotMatch(grant, /\bcriado_por\b/i)
        assert.doesNotMatch(grant, /\bcriado_em\b/i)
        assert.doesNotMatch(grant, /\batualizado_em\b/i)
    }

    for (const campo of [
        'codigo', 'nome', 'unidade_medida', 'tipo_controle',
        'estoque_minimo', 'estoque_maximo', 'situacao', 'observacoes'
    ]) {
        assert.match(
            grants[0],
            new RegExp(`\\b${campo}\\b`, 'i'),
            `campo necessário não concedido: ${campo}`
        )
    }
})

test('funções privilegiadas usam search_path vazio', () => {
    for (const fn of [
        'almox_assert_admin',
        'almox_registrar_entrada',
        'almox_registrar_saida',
        'almox_registrar_ajuste',
        'almox_transferir',
        'almox_estornar_movimentacao'
    ]) {
        const inicio = sql.indexOf(`create or replace function public.${fn}(`)
        assert.notEqual(inicio, -1, `função ${fn} ausente`)

        const fim = sql.indexOf('as $$', inicio)
        assert.notEqual(fim, -1, `cabeçalho de ${fn} incompleto`)

        const cabecalho = sql.slice(inicio, fim)
        assert.match(
            cabecalho,
            /set search_path\s*=\s*''/i,
            `${fn} deve usar search_path vazio`
        )
        assert.doesNotMatch(
            cabecalho,
            /set search_path\s*=\s*public\b/i,
            `${fn} ainda usa search_path público`
        )
    }
})

test('migration não contém comandos destrutivos', () => {
    assert.doesNotMatch(sql, /\bdrop\s+table\b/i)
    assert.doesNotMatch(sql, /\btruncate\b/i)
    assert.doesNotMatch(sql, /\bdelete\s+from\b/i)
    assert.doesNotMatch(sql, /\bdrop\s+schema\b/i)
})

test('autorização exige o e-mail master autenticado', () => {
    assert.match(sql, /function public\.is_almox_admin/i)
    assert.match(sql, /auth\.uid\(\) is not null/i)
    assert.match(
        sql,
        /lower\(coalesce\(auth\.jwt\(\)\s*->>\s*'email',\s*''\)\)\s*=\s*'sulsafetreinamentos@gmail\.com'/i
    )
    assert.doesNotMatch(sql, /p\.role in \('admin', 'super_admin'\)/i)
    assert.match(sql, /almox_assert_admin/i)
})

test('is_almox_admin exige perfil ativo alem do e-mail master', () => {
    assert.match(endurecimento, /create or replace function public\.is_almox_admin/i)
    assert.match(endurecimento, /auth\.uid\(\) is not null/i)
    assert.match(endurecimento, /sulsafetreinamentos@gmail\.com/i)
    assert.match(endurecimento, /from public\.profiles p/i)
    assert.match(endurecimento, /p\.id = auth\.uid\(\)/i)
    assert.match(endurecimento, /p\.status = 'ativo'/i)
    assert.match(endurecimento, /security definer/i)
    assert.match(endurecimento, /set search_path\s*=\s*''/i)
    assert.match(endurecimento, /revoke all on function public\.is_almox_admin\(\) from public, anon/i)
    assert.match(endurecimento, /revoke all on function public\.almox_assert_admin\(\) from public, anon/i)
})

test('entrada controlada por lote exige lote e validade', () => {
    assert.match(sql, /Informe o lote para itens controlados por lote/i)
    assert.match(sql, /Informe a validade para itens controlados por lote/i)
    assert.match(sql, /Somente itens controlados por lote aceitam lote\/validade/i)
})

test('perda e descarte só reduzem o saldo', () => {
    assert.match(sql, /Perda\/descarte deve reduzir o saldo/i)
    assert.match(sql, /Perda\/descarte deve reduzir a quantidade do lote/i)
})

test('migration impede estorno duplicado no banco', () => {
    assert.match(
        sql,
        /create unique index if not exists almox_mov_estorno_unico_uidx\s+on public\.almox_movimentacoes\s*\(estorno_de\)\s*where estorno_de is not null/i
    )
})
