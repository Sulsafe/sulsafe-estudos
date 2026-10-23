// ============================================================
// SERVIÇOS DO ALMOXARIFADO (Supabase)
// Toda escrita de saldo ocorre via RPC transacional no banco.
// ============================================================

import { sb } from './supabase-client.js'

const LIMITE_LISTA = 1000

function falhou(error) {
    return { data: null, error }
}

function limparFiltroTexto(valor) {
    return String(valor ?? '')
        .replace(/[,%()]/g, ' ')
        .trim()
}

function vazioParaNulo(valor) {
    if (valor === undefined || valor === null) return null
    const texto = String(valor).trim()
    return texto === '' ? null : texto
}

function numeroOuNulo(valor) {
    if (valor === undefined || valor === null || valor === '') return null
    const numero = Number(String(valor).replace(',', '.'))
    return Number.isFinite(numero) ? numero : null
}

async function chamarRpc(nome, parametros) {
    try {
        const { data, error } = await sb.rpc(nome, parametros)
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return falhou(error)
    }
}

// ============================================================
// CATEGORIAS
// ============================================================
export async function almoxGetCategorias() {
    try {
        const { data, error } = await sb.from('almox_categorias')
            .select('id, nome, descricao, criado_em')
            .order('nome')
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return falhou(error)
    }
}

export async function almoxSalvarCategoria({ id, nome, descricao }) {
    try {
        const registro = {
            nome: String(nome || '').trim(),
            descricao: vazioParaNulo(descricao)
        }
        if (!registro.nome) throw new Error('Informe o nome da categoria.')

        const query = id
            ? sb.from('almox_categorias').update(registro).eq('id', id)
            : sb.from('almox_categorias').insert(registro)

        const { data, error } = await query.select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return falhou(error)
    }
}

export async function almoxRemoverCategoria(id) {
    try {
        const { error } = await sb.from('almox_categorias').delete().eq('id', id)
        if (error) throw error
        return { data: true, error: null }
    } catch (error) {
        return falhou(error)
    }
}

// ============================================================
// FORNECEDORES
// ============================================================
export async function almoxGetFornecedores() {
    try {
        const { data, error } = await sb.from('almox_fornecedores')
            .select('*')
            .order('razao_social')
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return falhou(error)
    }
}

export async function almoxSalvarFornecedor(dados = {}) {
    try {
        const registro = {
            razao_social: String(dados.razao_social || '').trim(),
            nome_fantasia: vazioParaNulo(dados.nome_fantasia),
            cnpj: vazioParaNulo(dados.cnpj),
            email: vazioParaNulo(dados.email),
            telefone: vazioParaNulo(dados.telefone),
            endereco: vazioParaNulo(dados.endereco),
            observacoes: vazioParaNulo(dados.observacoes),
            ativo: dados.ativo !== false
        }
        if (!registro.razao_social) throw new Error('Informe a razão social do fornecedor.')

        const query = dados.id
            ? sb.from('almox_fornecedores').update(registro).eq('id', dados.id)
            : sb.from('almox_fornecedores').insert(registro)

        const { data, error } = await query.select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return falhou(error)
    }
}

export async function almoxAlternarFornecedor(id, ativo) {
    try {
        const { data, error } = await sb.from('almox_fornecedores')
            .update({ ativo: Boolean(ativo) })
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return falhou(error)
    }
}

// ============================================================
// ITENS
// ============================================================
const SELECT_ITEM = `
    *,
    categoria:almox_categorias(id, nome),
    fornecedor:almox_fornecedores(id, razao_social)
`

export async function almoxGetItens(filtros = {}) {
    try {
        let query = sb.from('almox_itens').select(SELECT_ITEM)

        const busca = limparFiltroTexto(filtros.busca)
        if (busca) {
            query = query.or([
                `nome.ilike.%${busca}%`,
                `codigo.ilike.%${busca}%`,
                `numero_serie.ilike.%${busca}%`,
                `patrimonio.ilike.%${busca}%`,
                `localizacao.ilike.%${busca}%`,
                `setor.ilike.%${busca}%`
            ].join(','))
        }

        if (filtros.categoria_id) query = query.eq('categoria_id', filtros.categoria_id)
        if (filtros.situacao) query = query.eq('situacao', filtros.situacao)
        if (filtros.tipo_controle) query = query.eq('tipo_controle', filtros.tipo_controle)
        if (filtros.setor) query = query.ilike('setor', `%${limparFiltroTexto(filtros.setor)}%`)
        if (filtros.localizacao) query = query.ilike('localizacao', `%${limparFiltroTexto(filtros.localizacao)}%`)

        const { data, error } = await query.order('nome').limit(LIMITE_LISTA)
        if (error) throw error

        let itens = data || []
        if (filtros.situacao_estoque === 'sem_estoque') {
            itens = itens.filter(i => Number(i.saldo_atual) <= 0)
        } else if (filtros.situacao_estoque === 'estoque_baixo') {
            itens = itens.filter(i => {
                const saldo = Number(i.saldo_atual) || 0
                return saldo > 0 && saldo <= (Number(i.estoque_minimo) || 0)
            })
        }

        return { data: itens, error: null }
    } catch (error) {
        return falhou(error)
    }
}

export async function almoxGetItem(id) {
    try {
        const { data, error } = await sb.from('almox_itens').select(SELECT_ITEM).eq('id', id).single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return falhou(error)
    }
}

function dadosItem(dados) {
    return {
        codigo: String(dados.codigo || '').trim(),
        nome: String(dados.nome || '').trim(),
        descricao: vazioParaNulo(dados.descricao),
        categoria_id: vazioParaNulo(dados.categoria_id),
        marca: vazioParaNulo(dados.marca),
        modelo: vazioParaNulo(dados.modelo),
        unidade_medida: String(dados.unidade_medida || 'UN').trim().toUpperCase(),
        tipo_controle: dados.tipo_controle || 'quantidade',
        estoque_minimo: numeroOuNulo(dados.estoque_minimo) ?? 0,
        estoque_maximo: numeroOuNulo(dados.estoque_maximo),
        localizacao: vazioParaNulo(dados.localizacao),
        prateleira: vazioParaNulo(dados.prateleira),
        armario: vazioParaNulo(dados.armario),
        setor: vazioParaNulo(dados.setor),
        fornecedor_padrao_id: vazioParaNulo(dados.fornecedor_padrao_id),
        custo_unitario: numeroOuNulo(dados.custo_unitario),
        numero_serie: vazioParaNulo(dados.numero_serie),
        patrimonio: vazioParaNulo(dados.patrimonio),
        situacao: dados.situacao || 'ativo',
        observacoes: vazioParaNulo(dados.observacoes)
    }
}

export async function almoxCriarItem(dados) {
    try {
        const registro = dadosItem(dados)
        const { data, error } = await sb.from('almox_itens').insert(registro).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return falhou(error)
    }
}

export async function almoxAtualizarItem(id, dados) {
    try {
        // saldo_atual nunca é enviado pelo frontend.
        const registro = dadosItem(dados)
        const { data, error } = await sb.from('almox_itens')
            .update(registro)
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return falhou(error)
    }
}

export async function almoxRemoverItem(id) {
    try {
        const { error } = await sb.from('almox_itens').delete().eq('id', id)
        if (error) throw error
        return { data: true, error: null }
    } catch (error) {
        return falhou(error)
    }
}

// ============================================================
// LOTES
// ============================================================
export async function almoxGetLotes(filtros = {}) {
    try {
        let query = sb.from('almox_lotes')
            .select('*, item:almox_itens(id, codigo, nome, unidade_medida, tipo_controle, situacao)')

        if (filtros.item_id) query = query.eq('item_id', filtros.item_id)
        if (filtros.somente_com_saldo) query = query.gt('quantidade_atual', 0)
        if (filtros.de) query = query.gte('data_validade', filtros.de)
        if (filtros.ate) query = query.lte('data_validade', filtros.ate)

        const { data, error } = await query.order('data_validade', { ascending: true, nullsFirst: false })
        if (error) throw error
        return { data: data || [], error: null }
    } catch (error) {
        return falhou(error)
    }
}

// ============================================================
// MOVIMENTAÇÕES / AUDITORIA
// ============================================================
const SELECT_MOVIMENTACAO = `
    *,
    item:almox_itens(id, codigo, nome, unidade_medida),
    lote:almox_lotes(id, codigo_lote, data_validade),
    estorno:almox_movimentacoes!estorno_de(id, tipo, data_hora)
`

export async function almoxGetMovimentacoes(filtros = {}) {
    try {
        let query = sb.from('almox_movimentacoes').select(SELECT_MOVIMENTACAO)

        if (filtros.item_id) query = query.eq('item_id', filtros.item_id)
        if (filtros.lote_id) query = query.eq('lote_id', filtros.lote_id)
        if (filtros.tipo) query = query.eq('tipo', filtros.tipo)
        if (filtros.usuario_id) query = query.eq('usuario_id', filtros.usuario_id)
        if (filtros.de) query = query.gte('data_hora', filtros.de)
        if (filtros.ate) query = query.lte('data_hora', filtros.ate)

        const { data, error } = await query
            .order('data_hora', { ascending: false })
            .limit(filtros.limite || LIMITE_LISTA)
        if (error) throw error
        return { data: data || [], error: null }
    } catch (error) {
        return falhou(error)
    }
}

export async function almoxGetResumo() {
    // Carrega o histórico recente completo (limitado) para permitir auditoria.
    // O recorte por período é feito na camada de apresentação.
    const [categorias, fornecedores, itens, lotes, movimentacoes] = await Promise.all([
        almoxGetCategorias(),
        almoxGetFornecedores(),
        almoxGetItens(),
        almoxGetLotes({ somente_com_saldo: true }),
        almoxGetMovimentacoes({ limite: 1000 })
    ])

    const erro = categorias.error || fornecedores.error || itens.error || lotes.error || movimentacoes.error

    return {
        data: erro ? null : {
            categorias: categorias.data || [],
            fornecedores: fornecedores.data || [],
            itens: itens.data || [],
            lotes: lotes.data || [],
            movimentacoes: movimentacoes.data || []
        },
        error: erro || null
    }
}

// ============================================================
// OPERAÇÕES TRANSACIONAIS (RPC)
// ============================================================
export async function almoxRegistrarEntrada(dados = {}) {
    return chamarRpc('almox_registrar_entrada', {
        p_item_id: dados.item_id,
        p_quantidade: numeroOuNulo(dados.quantidade),
        p_lote: vazioParaNulo(dados.lote),
        p_validade: vazioParaNulo(dados.validade),
        p_fabricacao: vazioParaNulo(dados.fabricacao),
        p_custo_unitario: numeroOuNulo(dados.custo_unitario),
        p_fornecedor_id: vazioParaNulo(dados.fornecedor_id),
        p_documento: vazioParaNulo(dados.documento),
        p_responsavel: vazioParaNulo(dados.responsavel),
        p_observacoes: vazioParaNulo(dados.observacoes)
    })
}

export async function almoxRegistrarSaida(dados = {}) {
    return chamarRpc('almox_registrar_saida', {
        p_item_id: dados.item_id,
        p_quantidade: numeroOuNulo(dados.quantidade),
        p_lote_id: vazioParaNulo(dados.lote_id),
        p_motivo: vazioParaNulo(dados.motivo),
        p_destino: vazioParaNulo(dados.destino),
        p_setor: vazioParaNulo(dados.setor),
        p_responsavel: vazioParaNulo(dados.responsavel),
        p_observacoes: vazioParaNulo(dados.observacoes)
    })
}

export async function almoxRegistrarAjuste(dados = {}) {
    return chamarRpc('almox_registrar_ajuste', {
        p_item_id: dados.item_id,
        p_lote_id: vazioParaNulo(dados.lote_id),
        p_nova_quantidade: numeroOuNulo(dados.nova_quantidade),
        p_tipo: dados.tipo || 'ajuste',
        p_motivo: vazioParaNulo(dados.motivo),
        p_responsavel: vazioParaNulo(dados.responsavel),
        p_observacoes: vazioParaNulo(dados.observacoes)
    })
}

export async function almoxTransferir(dados = {}) {
    return chamarRpc('almox_transferir', {
        p_item_id: dados.item_id,
        p_localizacao: vazioParaNulo(dados.localizacao),
        p_prateleira: vazioParaNulo(dados.prateleira),
        p_armario: vazioParaNulo(dados.armario),
        p_setor: vazioParaNulo(dados.setor),
        p_motivo: vazioParaNulo(dados.motivo),
        p_responsavel: vazioParaNulo(dados.responsavel)
    })
}

export async function almoxEstornarMovimentacao(movimentacaoId, motivo) {
    return chamarRpc('almox_estornar_movimentacao', {
        p_movimentacao_id: movimentacaoId,
        p_motivo: vazioParaNulo(motivo)
    })
}

export async function almoxGetUsuariosMovimentacao() {
    try {
        const { data, error } = await sb.from('almox_movimentacoes')
            .select('usuario_id, usuario_nome')
            .not('usuario_id', 'is', null)
            .limit(1000)
        if (error) throw error

        const mapa = new Map()
        ;(data || []).forEach(m => {
            if (m.usuario_id) mapa.set(m.usuario_id, m.usuario_nome || m.usuario_id)
        })
        return {
            data: [...mapa.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
            error: null
        }
    } catch (error) {
        return falhou(error)
    }
}
