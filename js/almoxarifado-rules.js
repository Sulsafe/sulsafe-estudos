// ============================================================
// REGRAS PURAS DO ALMOXARIFADO
// Sem dependência de DOM/Supabase para permitir testes unitários.
// ============================================================

export const UNIDADES_MEDIDA = [
    'UN', 'KG', 'G', 'L', 'ML', 'M', 'M2', 'M3',
    'CX', 'PCT', 'ROLO', 'PAR', 'KIT'
]

export const TIPOS_CONTROLE = [
    { id: 'quantidade', nome: 'Quantidade' },
    { id: 'lote', nome: 'Lote / Validade' },
    { id: 'individual', nome: 'Individualizado (série/patrimônio)' }
]

export const SITUACOES_ITEM = ['ativo', 'inativo', 'bloqueado', 'descartado']

const TIPOS_MOVIMENTO_VALIDOS = [
    'entrada', 'saida', 'ajuste', 'transferencia', 'perda', 'descarte', 'estorno'
]

export function normalizarTexto(valor) {
    return String(valor ?? '').trim()
}

export function validarQuantidade(valor, opcoes = {}) {
    const permitirZero = opcoes.permitirZero === true
    const numero = typeof valor === 'number' ? valor : Number(String(valor ?? '').replace(',', '.'))

    if (!Number.isFinite(numero)) {
        return { ok: false, valor: null, erro: 'Informe uma quantidade numérica.' }
    }
    if (numero < 0) {
        return { ok: false, valor: null, erro: 'A quantidade não pode ser negativa.' }
    }
    if (!permitirZero && numero === 0) {
        return { ok: false, valor: null, erro: 'A quantidade deve ser maior que zero.' }
    }
    return { ok: true, valor: numero, erro: null }
}

export function inicioDoDia(data) {
    const d = data instanceof Date ? new Date(data.getTime()) : new Date(data)
    if (Number.isNaN(d.getTime())) return null
    d.setHours(0, 0, 0, 0)
    return d
}

export function diasParaVencer(dataValidade, hoje = new Date()) {
    if (!dataValidade) return null

    // Datas puras (YYYY-MM-DD) são interpretadas ao meio-dia local para
    // evitar deslocamento de fuso horário.
    const texto = String(dataValidade)
    const base = /^\d{4}-\d{2}-\d{2}$/.test(texto)
        ? new Date(`${texto}T12:00:00`)
        : new Date(dataValidade)

    if (Number.isNaN(base.getTime())) return null

    const referencia = inicioDoDia(hoje)
    if (!referencia) return null

    const alvo = inicioDoDia(base)
    return Math.round((alvo.getTime() - referencia.getTime()) / 86400000)
}

export function statusValidade(dataValidade, hoje = new Date(), alertaDias = 30) {
    const dias = diasParaVencer(dataValidade, hoje)
    if (dias === null) return { status: 'sem_validade', dias: null, label: 'Sem validade' }
    if (dias < 0) return { status: 'vencido', dias, label: 'Vencido' }
    if (dias <= Math.max(1, Math.floor(alertaDias / 3))) {
        return { status: 'critico', dias, label: 'Vence em breve' }
    }
    if (dias <= alertaDias) return { status: 'atencao', dias, label: 'Próximo do vencimento' }
    return { status: 'ok', dias, label: 'Dentro da validade' }
}

export function statusEstoque(saldoAtual, estoqueMinimo) {
    const saldo = Number(saldoAtual) || 0
    const minimo = Number(estoqueMinimo) || 0

    if (saldo <= 0) return { status: 'sem_estoque', label: 'Sem estoque' }
    if (saldo <= minimo) return { status: 'estoque_baixo', label: 'Estoque baixo' }
    return { status: 'normal', label: 'Normal' }
}

export function formatarQuantidade(valor, unidade = '') {
    const numero = Number(valor)
    if (!Number.isFinite(numero)) return '—'
    const formatado = numero.toLocaleString('pt-BR', {
        minimumFractionDigits: Number.isInteger(numero) ? 0 : 2,
        maximumFractionDigits: 3
    })
    return unidade ? `${formatado} ${unidade}` : formatado
}

export function formatarMoeda(valor) {
    const numero = Number(valor)
    if (!Number.isFinite(numero)) return '—'
    return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function calcularResumoEstoque(itens = [], lotes = [], hoje = new Date(), alertaDias = 30) {
    const listaItens = Array.isArray(itens) ? itens : []
    const listaLotes = Array.isArray(lotes) ? lotes : []

    let semEstoque = 0
    let estoqueBaixo = 0
    let itensComCusto = 0
    let valorEstimado = 0

    for (const item of listaItens) {
        const saldo = Number(item.saldo_atual) || 0
        const minimo = Number(item.estoque_minimo) || 0
        if (item.situacao === 'descartado') continue

        if (saldo <= 0) semEstoque += 1
        else if (saldo <= minimo) estoqueBaixo += 1

        const custo = Number(item.custo_unitario)
        if (Number.isFinite(custo) && custo > 0) {
            itensComCusto += 1
            valorEstimado += saldo * custo
        }
    }

    let lotesVencidos = 0
    let lotesProximos = 0
    let itensVencidosDiferentes = new Set()
    let itensProximosDiferentes = new Set()

    for (const lote of listaLotes) {
        const quantidade = Number(lote.quantidade_atual) || 0
        if (quantidade <= 0) continue

        const info = statusValidade(lote.data_validade, hoje, alertaDias)
        if (info.status === 'vencido') {
            lotesVencidos += 1
            if (lote.item_id) itensVencidosDiferentes.add(lote.item_id)
        } else if (info.status === 'atencao' || info.status === 'critico') {
            lotesProximos += 1
            if (lote.item_id) itensProximosDiferentes.add(lote.item_id)
        }
    }

    return {
        totalItens: listaItens.filter(i => i.situacao !== 'descartado').length,
        semEstoque,
        estoqueBaixo,
        itensComCusto,
        valorEstimado,
        lotesVencidos,
        lotesProximos,
        itensVencidos: itensVencidosDiferentes.size,
        itensProximosVencimento: itensProximosDiferentes.size
    }
}

export function agruparItensPorCategoria(itens = []) {
    const mapa = new Map()

    for (const item of Array.isArray(itens) ? itens : []) {
        if (item.situacao === 'descartado') continue
        const nome = normalizarTexto(item.categoria?.nome || item.categoria_nome || 'Sem categoria') || 'Sem categoria'
        mapa.set(nome, (mapa.get(nome) || 0) + 1)
    }

    return [...mapa.entries()]
        .map(([categoria, total]) => ({ categoria, total }))
        .sort((a, b) => b.total - a.total)
}

function chaveDia(data) {
    const d = data instanceof Date ? data : new Date(data)
    if (Number.isNaN(d.getTime())) return null
    const ano = d.getFullYear()
    const mes = String(d.getMonth() + 1).padStart(2, '0')
    const dia = String(d.getDate()).padStart(2, '0')
    return `${ano}-${mes}-${dia}`
}

export function serieMovimentacoesPorDia(movimentacoes = [], dias = 30, hoje = new Date()) {
    const totalDias = Math.max(1, Math.floor(Number(dias) || 30))
    const referencia = inicioDoDia(hoje)
    const diasMapa = new Map()

    if (!referencia) return []

    for (let i = totalDias - 1; i >= 0; i--) {
        const d = new Date(referencia.getTime() - i * 86400000)
        diasMapa.set(chaveDia(d), { data: chaveDia(d), entradas: 0, saidas: 0 })
    }

    for (const mov of Array.isArray(movimentacoes) ? movimentacoes : []) {
        const chave = chaveDia(mov.data_hora || mov.criado_em)
        if (!chave || !diasMapa.has(chave)) continue
        const registro = diasMapa.get(chave)
        if (mov.tipo === 'entrada' || mov.tipo === 'estorno') registro.entradas += 1
        if (mov.tipo === 'saida') registro.saidas += 1
    }

    return [...diasMapa.values()]
}

export function labelMovimentacao(tipo) {
    const labels = {
        entrada: 'Entrada',
        saida: 'Saída',
        ajuste: 'Ajuste de inventário',
        transferencia: 'Transferência',
        perda: 'Perda/Avaria',
        descarte: 'Descarte',
        estorno: 'Estorno'
    }
    return labels[tipo] || tipo || '—'
}

export function classeMovimentacao(tipo) {
    if (tipo === 'entrada') return 'mov-entrada'
    if (tipo === 'saida') return 'mov-saida'
    if (tipo === 'perda' || tipo === 'descarte') return 'mov-perda'
    if (tipo === 'estorno') return 'mov-estorno'
    if (tipo === 'ajuste') return 'mov-ajuste'
    return 'mov-transferencia'
}

export function tipoMovimentoValido(tipo) {
    return TIPOS_MOVIMENTO_VALIDOS.includes(tipo)
}

export function podeEstornar(movimentacao) {
    if (!movimentacao) return false
    if (!['entrada', 'saida'].includes(movimentacao.tipo)) return false
    if (movimentacao.estornado === true) return false
    return true
}

export function validarItem(item = {}) {
    const erros = {}
    const codigo = normalizarTexto(item.codigo)
    const nome = normalizarTexto(item.nome)
    const unidade = normalizarTexto(item.unidade_medida)

    if (!codigo) erros.codigo = 'Informe o código interno/SKU.'
    if (!nome) erros.nome = 'Informe o nome do item.'
    if (!unidade) erros.unidade_medida = 'Informe a unidade de medida.'
    else if (!UNIDADES_MEDIDA.includes(unidade.toUpperCase())) erros.unidade_medida = 'Unidade de medida não suportada.'

    if (item.tipo_controle && !TIPOS_CONTROLE.some(t => t.id === item.tipo_controle)) {
        erros.tipo_controle = 'Tipo de controle inválido.'
    }
    if (item.situacao && !SITUACOES_ITEM.includes(item.situacao)) {
        erros.situacao = 'Situação inválida.'
    }

    const minimo = validarQuantidade(item.estoque_minimo ?? 0, { permitirZero: true })
    if (!minimo.ok) erros.estoque_minimo = minimo.erro

    if (item.estoque_maximo !== '' && item.estoque_maximo !== null && item.estoque_maximo !== undefined) {
        const maximo = validarQuantidade(item.estoque_maximo, { permitirZero: true })
        if (!maximo.ok) erros.estoque_maximo = maximo.erro
        else if (minimo.ok && maximo.valor < minimo.valor) {
            erros.estoque_maximo = 'O estoque máximo deve ser maior ou igual ao mínimo.'
        }
    }

    if (item.custo_unitario !== '' && item.custo_unitario !== null && item.custo_unitario !== undefined) {
        const custo = validarQuantidade(item.custo_unitario, { permitirZero: true })
        if (!custo.ok) erros.custo_unitario = custo.erro
    }

    return { ok: Object.keys(erros).length === 0, erros }
}

function escaparCSV(valor) {
    let texto = valor === null || valor === undefined ? '' : String(valor)
    // Evita injeção de fórmulas ao abrir o CSV em planilhas.
    if (/^[=+\-@]/.test(texto)) texto = `'${texto}`
    if (/[";\n\r]/.test(texto)) {
        return `"${texto.replace(/"/g, '""')}"`
    }
    return texto
}

export function gerarCSV(linhas = [], colunas = []) {
    const cols = Array.isArray(colunas) ? colunas : []
    if (cols.length === 0) return ''

    const cabecalho = cols.map(c => escaparCSV(c.titulo || c.chave)).join(';')
    const corpo = (Array.isArray(linhas) ? linhas : []).map(linha => {
        return cols.map(coluna => {
            const valor = typeof coluna.valor === 'function' ? coluna.valor(linha) : linha[coluna.chave]
            return escaparCSV(valor)
        }).join(';')
    })

    return [cabecalho, ...corpo].join('\r\n')
}

export function nomeArquivoCSV(prefixo = 'relatorio') {
    const agora = new Date()
    const data = chaveDia(agora) || 'sem-data'
    const hora = `${String(agora.getHours()).padStart(2, '0')}${String(agora.getMinutes()).padStart(2, '0')}`
    return `${prefixo}_${data}_${hora}.csv`
}
