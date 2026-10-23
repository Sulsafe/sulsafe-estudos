import test from 'node:test'
import assert from 'node:assert/strict'

import {
    validarQuantidade,
    diasParaVencer,
    statusValidade,
    statusEstoque,
    formatarQuantidade,
    calcularResumoEstoque,
    agruparItensPorCategoria,
    serieMovimentacoesPorDia,
    podeEstornar,
    validarItem,
    gerarCSV
} from '../js/almoxarifado-rules.js'

const HOJE = new Date('2026-10-21T12:00:00')

test('validarQuantidade aceita número e string decimal com vírgula', () => {
    assert.equal(validarQuantidade(5).ok, true)
    assert.equal(validarQuantidade('2,5').valor, 2.5)
    assert.equal(validarQuantidade('0').ok, false)
    assert.equal(validarQuantidade('0', { permitirZero: true }).ok, true)
    assert.equal(validarQuantidade('-1').ok, false)
    assert.equal(validarQuantidade('abc').ok, false)
})

test('diasParaVencer considera datas puras sem deslocamento de fuso', () => {
    assert.equal(diasParaVencer('2026-10-21', HOJE), 0)
    assert.equal(diasParaVencer('2026-10-31', HOJE), 10)
    assert.equal(diasParaVencer('2026-10-20', HOJE), -1)
    assert.equal(diasParaVencer(null, HOJE), null)
})

test('statusValidade classifica vencido, crítico, atenção e ok', () => {
    assert.equal(statusValidade('2026-10-20', HOJE, 30).status, 'vencido')
    assert.equal(statusValidade('2026-10-24', HOJE, 30).status, 'critico')
    assert.equal(statusValidade('2026-11-10', HOJE, 30).status, 'atencao')
    assert.equal(statusValidade('2027-01-10', HOJE, 30).status, 'ok')
    assert.equal(statusValidade(null, HOJE, 30).status, 'sem_validade')
})

test('statusEstoque detecta sem estoque e estoque baixo', () => {
    assert.equal(statusEstoque(0, 2).status, 'sem_estoque')
    assert.equal(statusEstoque(2, 2).status, 'estoque_baixo')
    assert.equal(statusEstoque(3, 2).status, 'normal')
})

test('formatarQuantidade usa unidade sem somar medidas diferentes', () => {
    assert.equal(formatarQuantidade(10, 'UN'), '10 UN')
    assert.equal(formatarQuantidade(2.5, 'KG'), '2,50 KG')
    assert.equal(formatarQuantidade('x', 'UN'), '—')
})

test('calcularResumoEstoque não soma quantidades heterogêneas', () => {
    const itens = [
        { saldo_atual: 0, estoque_minimo: 1, custo_unitario: 10, situacao: 'ativo' },
        { saldo_atual: 2, estoque_minimo: 2, custo_unitario: 5, situacao: 'ativo' },
        { saldo_atual: 100, estoque_minimo: 10, custo_unitario: null, situacao: 'ativo' },
        { saldo_atual: 99, estoque_minimo: 1, custo_unitario: 50, situacao: 'descartado' }
    ]
    const lotes = [
        { item_id: 'a', quantidade_atual: 1, data_validade: '2026-10-01' },
        { item_id: 'b', quantidade_atual: 1, data_validade: '2026-10-25' },
        { item_id: 'c', quantidade_atual: 0, data_validade: '2026-10-01' }
    ]

    const resumo = calcularResumoEstoque(itens, lotes, HOJE, 30)

    assert.equal(resumo.totalItens, 3)
    assert.equal(resumo.semEstoque, 1)
    assert.equal(resumo.estoqueBaixo, 1)
    assert.equal(resumo.itensComCusto, 2)
    assert.equal(resumo.valorEstimado, 10)
    assert.equal(resumo.lotesVencidos, 1)
    assert.equal(resumo.lotesProximos, 1)
})

test('agruparItensPorCategoria conta itens, não quantidades', () => {
    const grupos = agruparItensPorCategoria([
        { categoria: { nome: 'EPI' } },
        { categoria: { nome: 'EPI' } },
        { categoria: { nome: 'Ferramentas' } },
        { categoria: { nome: 'EPI' }, situacao: 'descartado' }
    ])

    assert.deepEqual(grupos, [
        { categoria: 'EPI', total: 2 },
        { categoria: 'Ferramentas', total: 1 }
    ])
})

test('serieMovimentacoesPorDia conta movimentos e preenche dias vazios', () => {
    const serie = serieMovimentacoesPorDia([
        { tipo: 'entrada', data_hora: '2026-10-21T10:00:00' },
        { tipo: 'saida', data_hora: '2026-10-21T11:00:00' },
        { tipo: 'saida', data_hora: '2026-10-20T09:00:00' },
        { tipo: 'entrada', data_hora: '2026-01-01T09:00:00' }
    ], 2, HOJE)

    assert.equal(serie.length, 2)
    assert.deepEqual(serie[0], { data: '2026-10-20', entradas: 0, saidas: 1 })
    assert.deepEqual(serie[1], { data: '2026-10-21', entradas: 1, saidas: 1 })
})

test('podeEstornar só permite entrada/saída ainda não estornadas', () => {
    assert.equal(podeEstornar({ tipo: 'entrada' }), true)
    assert.equal(podeEstornar({ tipo: 'saida' }), true)
    assert.equal(podeEstornar({ tipo: 'saida', estornado: true }), false)
    assert.equal(podeEstornar({ tipo: 'ajuste' }), false)
    assert.equal(podeEstornar(null), false)
})

test('validarItem exige campos e coerência de estoque', () => {
    assert.equal(validarItem({ codigo: 'A1', nome: 'Luva', unidade_medida: 'PAR' }).ok, true)

    const invalido = validarItem({
        codigo: '',
        nome: '',
        unidade_medida: '',
        estoque_minimo: 10,
        estoque_maximo: 5
    })
    assert.equal(invalido.ok, false)
    assert.ok(invalido.erros.codigo)
    assert.ok(invalido.erros.nome)
    assert.ok(invalido.erros.unidade_medida)
    assert.ok(invalido.erros.estoque_maximo)

    const unidadeInvalida = validarItem({ codigo: 'A2', nome: 'Luva', unidade_medida: 'DUZIA' })
    assert.equal(unidadeInvalida.ok, false)
    assert.ok(unidadeInvalida.erros.unidade_medida)
})

test('gerarCSV escapa separadores e aspas', () => {
    const csv = gerarCSV(
        [{ nome: 'Luva; azul', qtd: 2 }, { nome: 'Capacete "classe B"', qtd: 1 }],
        [{ titulo: 'Item', chave: 'nome' }, { titulo: 'Qtd', chave: 'qtd' }]
    )

    assert.match(csv, /^Item;Qtd/)
    assert.match(csv, /"Luva; azul";2/)
    assert.match(csv, /"Capacete ""classe B""";1/)
})

test('gerarCSV neutraliza fórmulas de planilha', () => {
    const csv = gerarCSV(
        [{ nome: '=HYPERLINK("http://exemplo")', qtd: 1 }, { nome: '@comando', qtd: 2 }],
        [{ titulo: 'Item', chave: 'nome' }, { titulo: 'Qtd', chave: 'qtd' }]
    )

    assert.match(csv, /'=HYPERLINK/)
    assert.match(csv, /'@comando/)
})
