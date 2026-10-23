// ============================================================
// VIEW: ALMOXARIFADO (exclusivo ADMIN)
// ============================================================
import { S, fmtD } from '../state.js'
import { ADMIN_EMAIL, toast, sanitizar, openMdl, closeMdl, $ } from '../utils.js'
import {
    almoxGetResumo, almoxSalvarCategoria, almoxRemoverCategoria,
    almoxSalvarFornecedor, almoxAlternarFornecedor, almoxCriarItem,
    almoxAtualizarItem, almoxRemoverItem, almoxRegistrarEntrada,
    almoxRegistrarSaida, almoxRegistrarAjuste, almoxTransferir,
    almoxEstornarMovimentacao
} from '../almoxarifado.js'
import {
    UNIDADES_MEDIDA, TIPOS_CONTROLE, SITUACOES_ITEM, statusValidade,
    statusEstoque, formatarQuantidade, formatarMoeda, calcularResumoEstoque,
    agruparItensPorCategoria, serieMovimentacoesPorDia, labelMovimentacao,
    classeMovimentacao, podeEstornar, validarItem, validarQuantidade,
    gerarCSV, nomeArquivoCSV
} from '../almoxarifado-rules.js'
import { drawMovimentacoesPorDia, drawItensPorCategoria } from '../charts-admin.js'

const PAGINA = 15
const CK_ALERTA = 'ss_almox_alerta_dias'
const CK_PERIODO = 'ss_almox_periodo'

const estado = {
    aba: 'visao', carregado: false, carregando: false,
    categorias: [], fornecedores: [], itens: [], lotes: [], movimentacoes: [],
    periodo: Number(localStorage.getItem(CK_PERIODO)) || 30,
    alertaDias: Number(localStorage.getItem(CK_ALERTA)) || 30,
    paginaItens: 1, paginaMovs: 1,
    filtrosItens: { busca: '', categoria_id: '', situacao: '', situacao_estoque: '', tipo_controle: '' },
    filtrosMovs: { tipo: '', item_id: '', lote_id: '', usuario: '', de: '', ate: '' },
    filtrosLotes: { de: '', ate: '', item_id: '' },
    filtrosVisao: { categoria_id: '', situacao: '', local: '' }
}

// ------------------------------------------------------------
// SHELL
// ------------------------------------------------------------
export function vAlmoxarifado() {
        if (S.user?.email?.trim()?.toLowerCase() !== ADMIN_EMAIL) {
        toast('Acesso restrito aos administradores.', 'err')
        return window.nav('inicio')
    }

    const abas = [
        ['visao', 'fa-chart-pie', 'Visão Geral'],
        ['itens', 'fa-boxes-stacked', 'Itens'],
        ['movimentacoes', 'fa-right-left', 'Movimentações'],
        ['lotes', 'fa-calendar-days', 'Lotes & Validade'],
        ['fornecedores', 'fa-truck-field', 'Fornecedores'],
        ['relatorios', 'fa-file-csv', 'Relatórios']
    ]

    setTimeout(() => carregarAlmox(), 80)

    return `
    <div class="almox-hero">
        <div>
            <span class="adm-eyebrow"><i class="fas fa-boxes-stacked"></i> Operação</span>
            <h1>Almoxarifado</h1>
            <p>Materiais, lotes, validade, movimentações e auditoria — acesso exclusivo da administração.</p>
        </div>
        <div class="adm-hero-actions">
            <button type="button" class="btn btn-s" onclick="window.almoxAtualizar()"><i class="fas fa-rotate"></i> Atualizar</button>
            <button type="button" class="btn btn-p" onclick="window.almoxModalEntrada()"><i class="fas fa-arrow-down"></i> Entrada</button>
            <button type="button" class="btn btn-g" onclick="window.almoxModalSaida()"><i class="fas fa-arrow-up"></i> Saída</button>
            <button type="button" class="btn btn-s" onclick="window.almoxModalItem()"><i class="fas fa-plus"></i> Novo item</button>
        </div>
    </div>
    <div class="almox-tabs" role="tablist" aria-label="Seções do Almoxarifado">
        ${abas.map(([id, ic, rot]) => `<button type="button" role="tab" class="almox-tab ${estado.aba === id ? 'on' : ''}" aria-selected="${estado.aba === id}" data-aba="${id}" onclick="window.almoxSetAba('${id}')"><i class="fas ${ic}"></i> ${rot}</button>`).join('')}
    </div>
    <div id="almoxConteudo" role="tabpanel" aria-live="polite">
        <div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando almoxarifado...</p></div>
    </div>`
}

async function carregarAlmox() {
    if (estado.carregando) return
    estado.carregando = true
    const alvo = document.getElementById('almoxConteudo')
    if (alvo && !estado.carregado) alvo.innerHTML = '<div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando almoxarifado...</p></div>'

    const { data, error } = await almoxGetResumo()
    estado.carregando = false
    estado.carregado = true

    if (error || !data) {
        estado.categorias = []; estado.fornecedores = []; estado.itens = []; estado.lotes = []; estado.movimentacoes = []
        return renderErroConfiguracao(error)
    }

    estado.categorias = data.categorias || []
    estado.fornecedores = data.fornecedores || []
    estado.itens = data.itens || []
    estado.lotes = data.lotes || []
    estado.movimentacoes = data.movimentacoes || []
    renderTela()
}

function renderErroConfiguracao(error) {
    const alvo = document.getElementById('almoxConteudo')
    if (!alvo) return
    const msg = error?.message || 'Não foi possível consultar as tabelas do Almoxarifado.'
    const semTabela = /does not exist|relation|schema cache|42P01|PGRST205/i.test(msg)

    alvo.innerHTML = `
    <div class="almox-config">
        <i class="fas fa-database"></i>
        <h3>${semTabela ? 'Módulo aguardando configuração no Supabase' : 'Falha ao carregar o Almoxarifado'}</h3>
        <p>${semTabela ? 'As tabelas do Almoxarifado ainda não existem no banco. Aplique a migration versionada para ativar o módulo.' : sanitizar(msg)}</p>
        ${semTabela ? '<code>supabase/migrations/20261021000000_almoxarifado.sql</code><p class="almox-muted">Nenhum dado foi criado ou alterado.</p>' : ''}
        <button type="button" class="btn btn-p" onclick="window.almoxAtualizar()"><i class="fas fa-rotate"></i> Tentar novamente</button>
    </div>`
}

function renderTela() {
    const alvo = document.getElementById('almoxConteudo')
    if (!alvo) return

    document.querySelectorAll('.almox-tab').forEach(b => {
        const ativo = b.dataset.aba === estado.aba
        b.classList.toggle('on', ativo)
        b.setAttribute('aria-selected', ativo ? 'true' : 'false')
    })

    if (estado.aba === 'itens') alvo.innerHTML = renderItens()
    else if (estado.aba === 'movimentacoes') alvo.innerHTML = renderMovimentacoes()
    else if (estado.aba === 'lotes') alvo.innerHTML = renderLotes()
    else if (estado.aba === 'fornecedores') alvo.innerHTML = renderFornecedores()
    else if (estado.aba === 'relatorios') alvo.innerHTML = renderRelatorios()
    else { alvo.innerHTML = renderVisao(); setTimeout(desenharGraficosVisao, 60) }
}

// ------------------------------------------------------------
// VISÃO GERAL
// ------------------------------------------------------------
function movsPeriodo() {
    const limite = Date.now() - estado.periodo * 86400000
    return estado.movimentacoes.filter(m => new Date(m.data_hora || m.criado_em).getTime() >= limite)
}

function itensVisao() {
    const f = estado.filtrosVisao
    const local = String(f.local || '').toLowerCase().trim()
    return estado.itens.filter(i => {
        if (f.categoria_id && i.categoria_id !== f.categoria_id) return false
        if (f.situacao && i.situacao !== f.situacao) return false
        if (local) {
            const texto = [i.localizacao, i.prateleira, i.armario, i.setor].map(v => String(v || '').toLowerCase()).join(' ')
            if (!texto.includes(local)) return false
        }
        return true
    })
}

function renderVisao() {
    const movs = movsPeriodo()
    const itens = itensVisao()
    const ids = new Set(itens.map(i => i.id))
    const lotes = estado.lotes.filter(l => ids.has(l.item_id))
    const resumo = calcularResumoEstoque(itens, lotes, new Date(), estado.alertaDias)
    const criticos = itens.filter(i => i.situacao !== 'descartado')
        .filter(i => Number(i.saldo_atual) <= 0 || (Number(i.saldo_atual) > 0 && Number(i.saldo_atual) <= Number(i.estoque_minimo)))
        .sort((a, b) => Number(a.saldo_atual) - Number(b.saldo_atual)).slice(0, 8)
    const alertas = lotes.map(l => ({ ...l, _v: statusValidade(l.data_validade, new Date(), estado.alertaDias) }))
        .filter(l => ['vencido', 'atencao', 'critico'].includes(l._v.status))
        .sort((a, b) => (a._v.dias ?? 9999) - (b._v.dias ?? 9999)).slice(0, 8)
    const filtrando = Boolean(estado.filtrosVisao.categoria_id || estado.filtrosVisao.situacao || estado.filtrosVisao.local)

    return `
    <div class="almox-toolbar">
        <div>
            <h2 class="adm-section-title"><i class="fas fa-chart-pie"></i> Panorama do estoque</h2>
            <p class="almox-muted">Movimentações dos últimos <strong>${estado.periodo}</strong> dias · alerta de validade em <strong>${estado.alertaDias}</strong> dias</p>
        </div>
        <div class="almox-toolbar-actions">
            <label class="almox-inline-field">Período
                <select onchange="window.almoxSetPeriodo(this.value)">${[7, 30, 90, 180, 365].map(d => `<option value="${d}" ${estado.periodo === d ? 'selected' : ''}>${d} dias</option>`).join('')}</select>
            </label>
            <label class="almox-inline-field">Alerta validade
                <input type="number" min="1" max="365" value="${estado.alertaDias}" onchange="window.almoxSetAlertaDias(this.value)">
            </label>
        </div>
    </div>
    <div class="almox-filters">
        <select id="filtroVisaoCategoria" onchange="window.almoxAplicarFiltrosVisao()" aria-label="Filtrar por categoria">${optionCategorias(estado.filtrosVisao.categoria_id, 'Todas as categorias')}</select>
        <select id="filtroVisaoSituacao" onchange="window.almoxAplicarFiltrosVisao()" aria-label="Filtrar por situação">
            <option value="">Situação: todas</option>
            ${SITUACOES_ITEM.map(s => `<option value="${s}" ${estado.filtrosVisao.situacao === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <input type="search" id="filtroVisaoLocal" class="search" placeholder="Localização, prateleira, armário ou setor" value="${sanitizar(estado.filtrosVisao.local)}" onkeydown="if(event.key==='Enter'){window.almoxAplicarFiltrosVisao()}" aria-label="Filtrar por localização">
        <button type="button" class="btn btn-sm btn-s" onclick="window.almoxAplicarFiltrosVisao()"><i class="fas fa-filter"></i> Filtrar</button>
        ${filtrando ? '<button type="button" class="btn btn-sm btn-s" onclick="window.almoxLimparFiltrosVisao()"><i class="fas fa-xmark"></i> Limpar</button>' : ''}
    </div>
    ${filtrando ? `<p class="almox-muted" style="margin:-6px 0 12px"><i class="fas fa-filter"></i> Indicadores considerando ${itens.length} de ${estado.itens.length} item(ns).</p>` : ''}
    <div class="kpi-grid">
        ${kpi('fa-boxes-stacked', resumo.totalItens, 'Itens cadastrados', `${estado.categorias.length} categorias`)}
        ${kpi('fa-arrow-trend-down', resumo.estoqueBaixo, 'Estoque baixo', 'Saldo ≤ mínimo', resumo.estoqueBaixo > 0 ? 'kpi-warn' : 'kpi-ok')}
        ${kpi('fa-box-open', resumo.semEstoque, 'Sem estoque', 'Reposição necessária', resumo.semEstoque > 0 ? 'kpi-warn' : 'kpi-ok')}
        ${kpi('fa-calendar-clock', resumo.lotesProximos, 'Próximos do vencimento', `Até ${estado.alertaDias} dias`, resumo.lotesProximos > 0 ? 'kpi-warn' : 'kpi-ok')}
        ${kpi('fa-calendar-xmark', resumo.lotesVencidos, 'Lotes vencidos', 'Bloqueados para saída', resumo.lotesVencidos > 0 ? 'kpi-danger' : 'kpi-ok')}
        ${kpi('fa-right-left', movs.length, 'Movimentações', `Últimos ${estado.periodo} dias`)}
        ${kpi('fa-coins', resumo.itensComCusto > 0 ? formatarMoeda(resumo.valorEstimado) : '—', 'Valor estimado', resumo.itensComCusto > 0 ? `${resumo.itensComCusto} item(ns) com custo` : 'Sem custo cadastrado', 'kpi-gold')}
        ${kpi('fa-truck-field', estado.fornecedores.length, 'Fornecedores', `${estado.fornecedores.filter(f => f.ativo !== false).length} ativo(s)`)}
    </div>
    ${renderSaldoPorUnidade(itens)}
    <div class="chart-grid">
        <section class="chart-card">
            <header><h3><i class="fas fa-chart-column"></i> Movimentações por dia</h3><span class="chart-hint">Entradas e saídas</span></header>
            <div class="chart-canvas"><canvas id="chartAlmoxMovDia" role="img" aria-label="Movimentações por dia"></canvas></div>
        </section>
        <section class="chart-card">
            <header><h3><i class="fas fa-layer-group"></i> Itens por categoria</h3><span class="chart-hint">Contagem de cadastros</span></header>
            <div class="chart-canvas"><canvas id="chartAlmoxCategorias" role="img" aria-label="Itens por categoria"></canvas></div>
        </section>
    </div>
    <div class="adm-split">
        <section class="pnl">
            <div class="pnl-h"><div class="pnl-t"><i class="fas fa-triangle-exclamation"></i> Itens que exigem atenção</div><button type="button" class="btn btn-sm btn-s" onclick="window.almoxSetAba('itens')">Ver todos</button></div>
            ${criticos.length ? tabelaCriticos(criticos) : '<div class="empty" style="padding:24px"><i class="fas fa-circle-check"></i><p>Nenhum item abaixo do mínimo.</p></div>'}
        </section>
        <section class="pnl">
            <div class="pnl-h"><div class="pnl-t"><i class="fas fa-calendar-days"></i> Lotes em alerta</div><button type="button" class="btn btn-sm btn-s" onclick="window.almoxSetAba('lotes')">Ver todos</button></div>
            ${alertas.length ? tabelaAlertas(alertas) : '<div class="empty" style="padding:24px"><i class="fas fa-circle-check"></i><p>Nenhum lote em alerta.</p></div>'}
        </section>
    </div>
    <section class="pnl">
        <div class="pnl-h"><div class="pnl-t"><i class="fas fa-clock-rotate-left"></i> Movimentações recentes</div><button type="button" class="btn btn-sm btn-s" onclick="window.almoxSetAba('movimentacoes')">Histórico</button></div>
        ${tabelaMovs(estado.movimentacoes.slice(0, 8), false)}
    </section>`
}

function renderSaldoPorUnidade(itensBase = estado.itens) {
    const mapa = new Map()
    itensBase.forEach(i => {
        if (i.situacao === 'descartado') return
        const unidade = String(i.unidade_medida || 'UN').toUpperCase()
        mapa.set(unidade, (mapa.get(unidade) || 0) + (Number(i.saldo_atual) || 0))
    })
    const itens = [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    if (!itens.length) return ''
    return `
    <section class="pnl almox-unidades-pnl">
        <div class="pnl-h"><div class="pnl-t"><i class="fas fa-scale-balanced"></i> Saldo total por unidade de medida</div></div>
        <div class="almox-unidades">
            ${itens.map(([unidade, total]) => `<div class="almox-unidade"><span>${sanitizar(unidade)}</span><strong>${formatarQuantidade(total)}</strong></div>`).join('')}
        </div>
        <p class="almox-muted" style="margin-top:8px">Somatórios feitos apenas dentro da mesma unidade de medida.</p>
    </section>`
}

function kpi(ic, valor, rotulo, detalhe = '', variante = '') {
    return `<div class="kpi ${variante}"><div class="kpi-ic"><i class="fas ${ic}"></i></div><div class="kpi-info"><div class="kpi-v">${valor}</div><div class="kpi-l">${sanitizar(rotulo)}</div>${detalhe ? `<div class="kpi-d">${sanitizar(detalhe)}</div>` : ''}</div></div>`
}

function desenharGraficosVisao() {
    drawMovimentacoesPorDia('chartAlmoxMovDia', serieMovimentacoesPorDia(movsPeriodo(), estado.periodo, new Date()))
    drawItensPorCategoria('chartAlmoxCategorias', agruparItensPorCategoria(itensVisao()))
}

function tabelaCriticos(itens) {
    let h = '<div class="tw"><table aria-label="Itens abaixo do mínimo"><thead><tr><th>Item</th><th>Saldo</th><th>Mínimo</th><th>Situação</th><th></th></tr></thead><tbody>'
    itens.forEach(i => {
        h += `<tr><td><strong>${sanitizar(i.nome)}</strong><br><span class="almox-muted">${sanitizar(i.codigo)}</span></td><td>${formatarQuantidade(i.saldo_atual, i.unidade_medida)}</td><td>${formatarQuantidade(i.estoque_minimo, i.unidade_medida)}</td><td>${badgeEstoque(statusEstoque(i.saldo_atual, i.estoque_minimo))}</td><td><button type="button" class="btn btn-sm btn-s" onclick="window.almoxModalEntrada('${i.id}')">Entrada</button></td></tr>`
    })
    return h + '</tbody></table></div>'
}

function tabelaAlertas(lotes) {
    let h = '<div class="tw"><table aria-label="Lotes em alerta"><thead><tr><th>Item</th><th>Lote</th><th>Validade</th><th>Saldo</th><th>Situação</th></tr></thead><tbody>'
    lotes.forEach(l => {
        h += `<tr><td><strong>${sanitizar(l.item?.nome || 'Item')}</strong><br><span class="almox-muted">${sanitizar(l.item?.codigo || '')}</span></td><td>${sanitizar(l.codigo_lote)}</td><td>${fmtD(l.data_validade)}</td><td>${formatarQuantidade(l.quantidade_atual, l.item?.unidade_medida || '')}</td><td>${badgeValidade(l._v)}</td></tr>`
    })
    return h + '</tbody></table></div>'
}

// ------------------------------------------------------------
// ITENS
// ------------------------------------------------------------
function itensFiltrados() {
    const f = estado.filtrosItens
    const busca = f.busca.toLowerCase().trim()
    return estado.itens.filter(i => {
        if (f.categoria_id && i.categoria_id !== f.categoria_id) return false
        if (f.situacao && i.situacao !== f.situacao) return false
        if (f.tipo_controle && i.tipo_controle !== f.tipo_controle) return false
        if (f.situacao_estoque === 'sem_estoque' && Number(i.saldo_atual) > 0) return false
        if (f.situacao_estoque === 'estoque_baixo') {
            const saldo = Number(i.saldo_atual) || 0
            if (!(saldo > 0 && saldo <= (Number(i.estoque_minimo) || 0))) return false
        }
        if (busca) {
            const texto = [i.nome, i.codigo, i.numero_serie, i.patrimonio, i.localizacao, i.setor, i.marca, i.modelo]
                .map(v => String(v || '').toLowerCase()).join(' ')
            if (!texto.includes(busca)) return false
        }
        return true
    })
}

function renderItens() {
    return `
    <div class="almox-toolbar">
        <div><h2 class="adm-section-title"><i class="fas fa-boxes-stacked"></i> Cadastro de materiais</h2><p class="almox-muted">Saldo é alterado apenas por movimentações registradas.</p></div>
        <div class="almox-toolbar-actions">
            <button type="button" class="btn btn-sm btn-s" onclick="window.almoxModalCategorias()"><i class="fas fa-tags"></i> Categorias</button>
            <button type="button" class="btn btn-p" onclick="window.almoxModalItem()"><i class="fas fa-plus"></i> Novo item</button>
        </div>
    </div>
    <div class="almox-filters">
        <input type="search" id="filtroItemBusca" class="search" placeholder="Buscar nome, código, série, local..." value="${sanitizar(estado.filtrosItens.busca)}" onkeydown="if(event.key==='Enter'){window.almoxAplicarFiltrosItens()}" aria-label="Buscar item">
        <select id="filtroItemCategoria" onchange="window.almoxAplicarFiltrosItens()" aria-label="Categoria">${optionCategorias(estado.filtrosItens.categoria_id, 'Todas as categorias')}</select>
        <select id="filtroItemEstoque" onchange="window.almoxAplicarFiltrosItens()" aria-label="Situação de estoque">
            <option value="">Estoque: todos</option>
            <option value="estoque_baixo" ${estado.filtrosItens.situacao_estoque === 'estoque_baixo' ? 'selected' : ''}>Estoque baixo</option>
            <option value="sem_estoque" ${estado.filtrosItens.situacao_estoque === 'sem_estoque' ? 'selected' : ''}>Sem estoque</option>
        </select>
        <select id="filtroItemTipo" onchange="window.almoxAplicarFiltrosItens()" aria-label="Tipo de controle">
            <option value="">Controle: todos</option>
            ${TIPOS_CONTROLE.map(t => `<option value="${t.id}" ${estado.filtrosItens.tipo_controle === t.id ? 'selected' : ''}>${t.nome}</option>`).join('')}
        </select>
        <select id="filtroItemSituacao" onchange="window.almoxAplicarFiltrosItens()" aria-label="Situação do item">
            <option value="">Situação: todas</option>
            ${SITUACOES_ITEM.map(s => `<option value="${s}" ${estado.filtrosItens.situacao === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <button type="button" class="btn btn-sm btn-s" onclick="window.almoxAplicarFiltrosItens()"><i class="fas fa-filter"></i> Filtrar</button>
    </div>
    <div id="almoxItensTabela">${tabelaItens()}</div>`
}

function tabelaItens() {
    const itens = itensFiltrados()
    const totalPag = Math.max(1, Math.ceil(itens.length / PAGINA))
    const pagina = Math.min(estado.paginaItens, totalPag)
    estado.paginaItens = pagina
    const recorte = itens.slice((pagina - 1) * PAGINA, pagina * PAGINA)

    let h = `<div class="almox-lista-info">${itens.length} item(ns) encontrado(s)</div>`
    if (!itens.length) return h + '<div class="empty"><i class="fas fa-box-open"></i><h4>Nenhum item encontrado</h4><p>Cadastre um material ou ajuste os filtros.</p></div>'

    h += '<div class="tw"><table aria-label="Itens do almoxarifado"><thead><tr><th>Código</th><th>Item</th><th>Controle</th><th>Saldo</th><th>Mín./Máx.</th><th>Localização</th><th>Validade</th><th>Situação</th><th>Ações</th></tr></thead><tbody>'
    recorte.forEach(i => {
        const est = statusEstoque(i.saldo_atual, i.estoque_minimo)
        const prox = estado.lotes.filter(l => l.item_id === i.id && Number(l.quantidade_atual) > 0 && l.data_validade)
            .sort((a, b) => String(a.data_validade).localeCompare(String(b.data_validade)))[0]
        const val = prox ? statusValidade(prox.data_validade, new Date(), estado.alertaDias) : null
        h += `<tr>
            <td><strong>${sanitizar(i.codigo)}</strong>${i.patrimonio ? `<br><span class="almox-muted">Patr. ${sanitizar(i.patrimonio)}</span>` : ''}</td>
            <td><strong>${sanitizar(i.nome)}</strong><br><span class="almox-muted">${sanitizar(i.categoria?.nome || 'Sem categoria')}${i.marca ? ` · ${sanitizar(i.marca)}` : ''}</span>${i.numero_serie ? `<br><span class="almox-muted">Série ${sanitizar(i.numero_serie)}</span>` : ''}</td>
            <td>${sanitizar(TIPOS_CONTROLE.find(t => t.id === i.tipo_controle)?.nome || i.tipo_controle)}</td>
            <td><strong>${formatarQuantidade(i.saldo_atual, i.unidade_medida)}</strong></td>
            <td>${formatarQuantidade(i.estoque_minimo, i.unidade_medida)}${i.estoque_maximo != null ? ` / ${formatarQuantidade(i.estoque_maximo, i.unidade_medida)}` : ''}</td>
            <td>${sanitizar([i.localizacao, i.prateleira, i.armario, i.setor].filter(Boolean).join(' · ') || '—')}</td>
            <td>${prox ? `${fmtD(prox.data_validade)}<br>${badgeValidade(val)}` : '<span class="almox-muted">—</span>'}</td>
            <td>${badgeEstoque(est)}${i.situacao !== 'ativo' ? `<br><span class="badge bg-err">${sanitizar(i.situacao)}</span>` : ''}</td>
            <td class="almox-acoes">
                <button type="button" class="btn btn-sm btn-s" onclick="window.almoxModalEntrada('${i.id}')" title="Entrada" aria-label="Entrada"><i class="fas fa-arrow-down"></i></button>
                <button type="button" class="btn btn-sm btn-s" onclick="window.almoxModalSaida('${i.id}')" title="Saída" aria-label="Saída"><i class="fas fa-arrow-up"></i></button>
                <button type="button" class="btn btn-sm btn-s" onclick="window.almoxModalAjuste('${i.id}')" title="Ajuste" aria-label="Ajuste"><i class="fas fa-sliders"></i></button>
                <button type="button" class="btn btn-sm btn-s" onclick="window.almoxModalItem('${i.id}')" title="Editar" aria-label="Editar"><i class="fas fa-pen"></i></button>
                <button type="button" class="btn btn-sm btn-d" onclick="window.almoxExcluirItem('${i.id}')" title="Excluir" aria-label="Excluir"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`
    })
    return h + '</tbody></table></div>' + paginacao('itens', pagina, totalPag)
}

function paginacao(prefixo, pagina, total) {
    if (total <= 1) return ''
    return `<div class="almox-paginacao"><button type="button" class="btn btn-sm btn-s" ${pagina <= 1 ? 'disabled' : ''} onclick="window.almoxPagina('${prefixo}',${pagina - 1})"><i class="fas fa-chevron-left"></i> Anterior</button><span>Página ${pagina} de ${total}</span><button type="button" class="btn btn-sm btn-s" ${pagina >= total ? 'disabled' : ''} onclick="window.almoxPagina('${prefixo}',${pagina + 1})">Próxima <i class="fas fa-chevron-right"></i></button></div>`
}

// ------------------------------------------------------------
// MOVIMENTAÇÕES / AUDITORIA
// ------------------------------------------------------------
function movsFiltradas() {
    const f = estado.filtrosMovs
    return estado.movimentacoes.filter(m => {
        if (f.tipo && m.tipo !== f.tipo) return false
        if (f.item_id && m.item_id !== f.item_id) return false
        if (f.lote_id && m.lote_id !== f.lote_id) return false
        if (f.usuario && (m.usuario_nome || 'Sistema') !== f.usuario) return false
        if (f.de && new Date(m.data_hora) < new Date(`${f.de}T00:00:00`)) return false
        if (f.ate && new Date(m.data_hora) > new Date(`${f.ate}T23:59:59`)) return false
        return true
    })
}

function renderMovimentacoes() {
    return `
    <div class="almox-toolbar">
        <div><h2 class="adm-section-title"><i class="fas fa-right-left"></i> Movimentações & auditoria</h2><p class="almox-muted">Histórico rastreável. Registros efetivados não podem ser editados ou excluídos.</p></div>
        <div class="almox-toolbar-actions">
            <button type="button" class="btn btn-p" onclick="window.almoxModalEntrada()"><i class="fas fa-arrow-down"></i> Entrada</button>
            <button type="button" class="btn btn-g" onclick="window.almoxModalSaida()"><i class="fas fa-arrow-up"></i> Saída</button>
            <button type="button" class="btn btn-s" onclick="window.almoxModalAjuste()"><i class="fas fa-sliders"></i> Ajuste/Perda</button>
            <button type="button" class="btn btn-s" onclick="window.almoxModalTransferencia()"><i class="fas fa-location-dot"></i> Transferir</button>
        </div>
    </div>
    <div class="almox-filters">
        <select id="filtroMovTipo" onchange="window.almoxAplicarFiltrosMovs()" aria-label="Tipo">
            <option value="">Todos os tipos</option>
            ${['entrada', 'saida', 'ajuste', 'transferencia', 'perda', 'descarte', 'estorno'].map(t => `<option value="${t}" ${estado.filtrosMovs.tipo === t ? 'selected' : ''}>${labelMovimentacao(t)}</option>`).join('')}
        </select>
        <select id="filtroMovItem" onchange="window.almoxAplicarFiltrosMovs()" aria-label="Item">${optionItens(estado.filtrosMovs.item_id, 'Todos os itens')}</select>
        <select id="filtroMovLote" onchange="window.almoxAplicarFiltrosMovs()" aria-label="Lote">
            <option value="">Todos os lotes</option>
            ${estado.lotes.map(l => `<option value="${l.id}" ${estado.filtrosMovs.lote_id === l.id ? 'selected' : ''}>${sanitizar(l.item?.codigo || '')} · ${sanitizar(l.codigo_lote)}</option>`).join('')}
        </select>
        <select id="filtroMovUsuario" onchange="window.almoxAplicarFiltrosMovs()" aria-label="Usuário">
            <option value="">Todos os usuários</option>
            ${[...new Set(estado.movimentacoes.map(m => m.usuario_nome || 'Sistema'))].sort().map(nome => `<option value="${sanitizar(nome)}" ${estado.filtrosMovs.usuario === nome ? 'selected' : ''}>${sanitizar(nome)}</option>`).join('')}
        </select>
        <label class="almox-inline-field">De <input type="date" id="filtroMovDe" value="${estado.filtrosMovs.de}" onchange="window.almoxAplicarFiltrosMovs()"></label>
        <label class="almox-inline-field">Até <input type="date" id="filtroMovAte" value="${estado.filtrosMovs.ate}" onchange="window.almoxAplicarFiltrosMovs()"></label>
        <button type="button" class="btn btn-sm btn-s" onclick="window.almoxLimparFiltrosMovs()"><i class="fas fa-xmark"></i> Limpar</button>
    </div>
    <div id="almoxMovTabela">${tabelaMovsPaginada()}</div>`
}

function tabelaMovsPaginada() {
    const movs = movsFiltradas()
    const totalPag = Math.max(1, Math.ceil(movs.length / PAGINA))
    const pagina = Math.min(estado.paginaMovs, totalPag)
    estado.paginaMovs = pagina
    return `<div class="almox-lista-info">${movs.length} movimentação(ões)</div>`
        + tabelaMovs(movs.slice((pagina - 1) * PAGINA, pagina * PAGINA), true)
        + paginacao('movs', pagina, totalPag)
}

function tabelaMovs(lista, acoes) {
    if (!lista?.length) return '<div class="empty" style="padding:30px"><i class="fas fa-clock-rotate-left"></i><h4>Nenhuma movimentação</h4><p>Registre uma entrada ou saída para iniciar o histórico.</p></div>'
    const estornadas = new Set(estado.movimentacoes.map(m => m.estorno_de).filter(Boolean))

    let h = '<div class="tw"><table aria-label="Histórico de movimentações"><thead><tr><th>Data/hora</th><th>Tipo</th><th>Item</th><th>Lote</th><th>Qtd.</th><th>Saldo</th><th>Responsável/usuário</th><th>Motivo/destino</th>'
    if (acoes) h += '<th>Ações</th>'
    h += '</tr></thead><tbody>'
    lista.forEach(m => {
        const qtd = m.tipo === 'transferencia' ? '—' : formatarQuantidade(m.quantidade, m.item?.unidade_medida || '')
        const estornado = estornadas.has(m.id)
        h += `<tr>
            <td>${dataHora(m.data_hora || m.criado_em)}</td>
            <td><span class="mov-badge ${classeMovimentacao(m.tipo)}">${labelMovimentacao(m.tipo)}</span></td>
            <td><strong>${sanitizar(m.item?.nome || 'Item')}</strong><br><span class="almox-muted">${sanitizar(m.item?.codigo || '')}</span></td>
            <td>${m.lote?.codigo_lote ? sanitizar(m.lote.codigo_lote) : '<span class="almox-muted">—</span>'}</td>
            <td>${qtd}</td>
            <td>${formatarQuantidade(m.saldo_anterior, '')} → <strong>${formatarQuantidade(m.saldo_posterior, '')}</strong></td>
            <td>${sanitizar(m.responsavel || '—')}<br><span class="almox-muted">${sanitizar(m.usuario_nome || 'Sistema')}</span></td>
            <td>${sanitizar(m.motivo || '—')}${m.destino ? `<br><span class="almox-muted">→ ${sanitizar(m.destino)}</span>` : ''}${m.documento ? `<br><span class="almox-muted">Doc: ${sanitizar(m.documento)}</span>` : ''}</td>`
        if (acoes) {
            h += `<td class="almox-acoes">${podeEstornar({ ...m, estornado })
                ? `<button type="button" class="btn btn-sm btn-s" onclick="window.almoxModalEstorno('${m.id}')"><i class="fas fa-rotate-left"></i> Estornar</button>`
                : (estornado ? '<span class="badge bg-err">Estornada</span>' : '<span class="almox-muted">—</span>')}</td>`
        }
        h += '</tr>'
    })
    return h + '</tbody></table></div>'
}

// ------------------------------------------------------------
// LOTES
// ------------------------------------------------------------
function lotesFiltrados() {
    const f = estado.filtrosLotes
    return estado.lotes.filter(l => {
        if (f.item_id && l.item_id !== f.item_id) return false
        if (f.de && (!l.data_validade || String(l.data_validade) < f.de)) return false
        if (f.ate && (!l.data_validade || String(l.data_validade) > f.ate)) return false
        return true
    }).map(l => ({ ...l, _v: statusValidade(l.data_validade, new Date(), estado.alertaDias) }))
        .sort((a, b) => (a._v.dias ?? 99999) - (b._v.dias ?? 99999))
}

function renderLotes() {
    return `
    <div class="almox-toolbar">
        <div><h2 class="adm-section-title"><i class="fas fa-calendar-days"></i> Controle de validade</h2><p class="almox-muted">Lotes vencidos são bloqueados em saídas normais. Saídas por lote priorizam a validade mais próxima (FEFO).</p></div>
        <div class="almox-toolbar-actions">
            <label class="almox-inline-field">Alerta (dias) <input type="number" min="1" max="365" value="${estado.alertaDias}" onchange="window.almoxSetAlertaDias(this.value)"></label>
            <button type="button" class="btn btn-s" onclick="window.almoxModalAjuste()"><i class="fas fa-sliders"></i> Ajustar lote</button>
        </div>
    </div>
    <div class="almox-filters">
        <select id="filtroLoteItem" onchange="window.almoxAplicarFiltrosLotes()" aria-label="Item">${optionItens(estado.filtrosLotes.item_id, 'Todos os itens')}</select>
        <label class="almox-inline-field">Validade de <input type="date" id="filtroLoteDe" value="${estado.filtrosLotes.de}" onchange="window.almoxAplicarFiltrosLotes()"></label>
        <label class="almox-inline-field">até <input type="date" id="filtroLoteAte" value="${estado.filtrosLotes.ate}" onchange="window.almoxAplicarFiltrosLotes()"></label>
        <button type="button" class="btn btn-sm btn-s" onclick="window.almoxLimparFiltrosLotes()"><i class="fas fa-xmark"></i> Limpar</button>
    </div>
    <div id="almoxLotesTabela">${tabelaLotes()}</div>`
}

function tabelaLotes() {
    const lotes = lotesFiltrados()
    if (!lotes.length) return '<div class="empty"><i class="fas fa-calendar-check"></i><h4>Nenhum lote com saldo</h4><p>Lotes são criados automaticamente no registro de entradas.</p></div>'

    let h = `<div class="almox-lista-info">${lotes.length} lote(s) com saldo</div>`
    h += '<div class="tw"><table aria-label="Lotes e validade"><thead><tr><th>Item</th><th>Lote</th><th>Fabricação</th><th>Validade</th><th>Dias</th><th>Saldo</th><th>Custo unit.</th><th>Situação</th><th>Ações</th></tr></thead><tbody>'
    lotes.forEach(l => {
        const dias = l._v.dias
        h += `<tr>
            <td><strong>${sanitizar(l.item?.nome || 'Item')}</strong><br><span class="almox-muted">${sanitizar(l.item?.codigo || '')}</span></td>
            <td>${sanitizar(l.codigo_lote)}</td>
            <td>${l.data_fabricacao ? fmtD(l.data_fabricacao) : '<span class="almox-muted">—</span>'}</td>
            <td>${l.data_validade ? fmtD(l.data_validade) : '<span class="almox-muted">—</span>'}</td>
            <td>${dias === null ? '—' : (dias < 0 ? `${Math.abs(dias)} dia(s) vencido` : `${dias} dia(s)`)}</td>
            <td><strong>${formatarQuantidade(l.quantidade_atual, l.item?.unidade_medida || '')}</strong></td>
            <td>${l.custo_unitario != null ? formatarMoeda(l.custo_unitario) : '—'}</td>
            <td>${badgeValidade(l._v)}</td>
            <td class="almox-acoes">
                <button type="button" class="btn btn-sm btn-s" onclick="window.almoxModalAjuste('${l.item_id}','${l.id}')" title="Ajustar lote"><i class="fas fa-sliders"></i></button>
                <button type="button" class="btn btn-sm btn-s" onclick="window.almoxModalSaida('${l.item_id}','${l.id}')" title="Saída do lote"><i class="fas fa-arrow-up"></i></button>
            </td>
        </tr>`
    })
    return h + '</tbody></table></div>'
}

// ------------------------------------------------------------
// FORNECEDORES
// ------------------------------------------------------------
function renderFornecedores() {
    let h = `<div class="almox-toolbar"><div><h2 class="adm-section-title"><i class="fas fa-truck-field"></i> Fornecedores</h2><p class="almox-muted">Usados em entradas e no rastreio de lotes.</p></div><button type="button" class="btn btn-p" onclick="window.almoxModalFornecedor()"><i class="fas fa-plus"></i> Novo fornecedor</button></div>`
    if (!estado.fornecedores.length) return h + '<div class="empty"><i class="fas fa-truck-field"></i><h4>Nenhum fornecedor cadastrado</h4><p>Cadastre fornecedores para vinculá-los às entradas.</p></div>'

    h += '<div class="tw"><table aria-label="Fornecedores"><thead><tr><th>Razão social</th><th>CNPJ</th><th>Contato</th><th>Endereço</th><th>Situação</th><th>Ações</th></tr></thead><tbody>'
    estado.fornecedores.forEach(f => {
        h += `<tr>
            <td><strong>${sanitizar(f.razao_social)}</strong>${f.nome_fantasia ? `<br><span class="almox-muted">${sanitizar(f.nome_fantasia)}</span>` : ''}</td>
            <td>${sanitizar(f.cnpj || '—')}</td>
            <td>${sanitizar(f.telefone || '—')}<br><span class="almox-muted">${sanitizar(f.email || '')}</span></td>
            <td>${sanitizar(f.endereco || '—')}</td>
            <td><span class="badge ${f.ativo === false ? 'bg-err' : 'bg-ok'}">${f.ativo === false ? 'Inativo' : 'Ativo'}</span></td>
            <td class="almox-acoes">
                <button type="button" class="btn btn-sm btn-s" onclick="window.almoxModalFornecedor('${f.id}')" title="Editar"><i class="fas fa-pen"></i></button>
                <button type="button" class="btn btn-sm btn-s" onclick="window.almoxAlternarFornecedor('${f.id}',${f.ativo === false})" title="${f.ativo === false ? 'Reativar' : 'Desativar'}"><i class="fas ${f.ativo === false ? 'fa-toggle-off' : 'fa-toggle-on'}"></i></button>
            </td>
        </tr>`
    })
    return h + '</tbody></table></div>'
}

// ------------------------------------------------------------
// RELATÓRIOS
// ------------------------------------------------------------
const RELATORIOS = [
    ['posicao', 'fa-clipboard-list', 'Posição atual do estoque', 'Saldo, mínimo, máximo, local e situação.'],
    ['historico', 'fa-clock-rotate-left', 'Histórico por material', 'Todas as movimentações com saldo anterior e posterior.'],
    ['ajustes', 'fa-sliders', 'Inventário, ajustes e divergências', 'Ajustes, perdas e descartes com motivo e responsável.'],
    ['entradas', 'fa-arrow-down', 'Entradas por período', 'Recebimentos com documento e fornecedor.'],
    ['saidas', 'fa-arrow-up', 'Retiradas por período', 'Saídas com motivo, destino e responsável.'],
    ['abaixo_minimo', 'fa-triangle-exclamation', 'Abaixo do estoque mínimo', 'Itens que exigem reposição.'],
    ['sem_estoque', 'fa-box-open', 'Itens sem estoque', 'Itens com saldo zerado.'],
    ['lotes_vencer', 'fa-calendar-clock', 'Lotes próximos do vencimento', 'Conforme alerta configurado.'],
    ['vencidos', 'fa-calendar-xmark', 'Materiais vencidos', 'Lotes vencidos com saldo.'],
    ['perdas', 'fa-trash-can', 'Perdas e descartes', 'Baixas justificadas com motivo.'],
    ['consumo_setor', 'fa-building', 'Consumo por setor', 'Saídas agrupadas por setor/finalidade.'],
    ['valoracao', 'fa-coins', 'Valoração do estoque', 'Somente itens com custo informado.']
]

function renderRelatorios() {
    return `
    <div class="almox-toolbar"><div><h2 class="adm-section-title"><i class="fas fa-file-csv"></i> Relatórios</h2><p class="almox-muted">Exportação CSV e impressão usam os dados reais carregados. Nada é inventado.</p></div><button type="button" class="btn btn-s" onclick="window.almoxAtualizar()"><i class="fas fa-rotate"></i> Atualizar dados</button></div>
    <div class="report-grid">
        ${RELATORIOS.map(([id, ic, titulo, desc]) => `<article class="report-card"><div class="report-ic"><i class="fas ${ic}"></i></div><div class="report-body"><h3>${titulo}</h3><p>${desc}</p></div><div class="report-actions"><button type="button" class="btn btn-sm btn-s" onclick="window.almoxVerRelatorio('${id}')"><i class="fas fa-eye"></i> Prévia</button><button type="button" class="btn btn-sm btn-p" onclick="window.almoxExportarRelatorio('${id}')"><i class="fas fa-file-csv"></i> CSV</button><button type="button" class="btn btn-sm btn-s" onclick="window.almoxImprimirRelatorio('${id}')"><i class="fas fa-print"></i> Imprimir</button></div></article>`).join('')}
    </div>
    <section class="pnl" style="margin-top:20px"><div class="pnl-h"><div class="pnl-t"><i class="fas fa-eye"></i> Prévia do relatório</div></div><div id="almoxRelatorioPreview"><p class="almox-muted">Escolha “Prévia” em um relatório acima.</p></div></section>`
}

function obterRelatorio(tipo) {
    const itens = estado.itens
    const movs = estado.movimentacoes
    const lotes = estado.lotes.map(l => ({ ...l, _v: statusValidade(l.data_validade, new Date(), estado.alertaDias) }))
    const titulo = RELATORIOS.find(r => r[0] === tipo)?.[2] || 'Relatório'

    if (tipo === 'posicao') return { titulo, linhas: itens, colunas: [
        { t: 'Código', c: 'codigo' }, { t: 'Item', c: 'nome' }, { t: 'Categoria', f: i => i.categoria?.nome || 'Sem categoria' },
        { t: 'Unidade', c: 'unidade_medida' }, { t: 'Saldo', c: 'saldo_atual' }, { t: 'Mínimo', c: 'estoque_minimo' }, { t: 'Máximo', c: 'estoque_maximo' },
        { t: 'Localização', f: i => [i.localizacao, i.prateleira, i.armario, i.setor].filter(Boolean).join(' / ') },
        { t: 'Situação', f: i => statusEstoque(i.saldo_atual, i.estoque_minimo).label }
    ] }

    if (tipo === 'historico' || tipo === 'ajustes') {
        const tipos = tipo === 'ajustes' ? ['ajuste', 'perda', 'descarte'] : null
        return { titulo, linhas: tipos ? movs.filter(m => tipos.includes(m.tipo)) : movs, colunas: [
            { t: 'Data/hora', f: m => dataHora(m.data_hora) }, { t: 'Tipo', f: m => labelMovimentacao(m.tipo) },
            { t: 'Código', f: m => m.item?.codigo || '' }, { t: 'Item', f: m => m.item?.nome || '' },
            { t: 'Lote', f: m => m.lote?.codigo_lote || '' }, { t: 'Quantidade', f: m => `${m.quantidade} ${m.item?.unidade_medida || ''}`.trim() },
            { t: 'Saldo anterior', c: 'saldo_anterior' }, { t: 'Saldo posterior', c: 'saldo_posterior' },
            { t: 'Responsável', c: 'responsavel' }, { t: 'Usuário', c: 'usuario_nome' },
            { t: 'Motivo', c: 'motivo' }, { t: 'Origem', c: 'origem' }, { t: 'Destino', c: 'destino' }
        ] }
    }

    if (['entradas', 'saidas', 'perdas'].includes(tipo)) {
        const tipos = tipo === 'entradas' ? ['entrada'] : tipo === 'saidas' ? ['saida'] : ['perda', 'descarte']
        return { titulo, linhas: movs.filter(m => tipos.includes(m.tipo)), colunas: [
            { t: 'Data/hora', f: m => dataHora(m.data_hora) }, { t: 'Tipo', f: m => labelMovimentacao(m.tipo) },
            { t: 'Código', f: m => m.item?.codigo || '' }, { t: 'Item', f: m => m.item?.nome || '' },
            { t: 'Lote', f: m => m.lote?.codigo_lote || '' }, { t: 'Quantidade', f: m => `${m.quantidade} ${m.item?.unidade_medida || ''}`.trim() },
            { t: 'Saldo anterior', c: 'saldo_anterior' }, { t: 'Saldo posterior', c: 'saldo_posterior' },
            { t: 'Responsável', c: 'responsavel' }, { t: 'Destino', c: 'destino' }, { t: 'Motivo', c: 'motivo' },
            { t: 'Documento', c: 'documento' }, { t: 'Usuário', c: 'usuario_nome' }
        ] }
    }

    if (tipo === 'abaixo_minimo' || tipo === 'sem_estoque') {
        return { titulo, linhas: itens.filter(i => tipo === 'sem_estoque' ? Number(i.saldo_atual) <= 0 : (Number(i.saldo_atual) > 0 && Number(i.saldo_atual) <= (Number(i.estoque_minimo) || 0))), colunas: [
            { t: 'Código', c: 'codigo' }, { t: 'Item', c: 'nome' }, { t: 'Unidade', c: 'unidade_medida' },
            { t: 'Saldo', c: 'saldo_atual' }, { t: 'Mínimo', c: 'estoque_minimo' },
            { t: 'Localização', f: i => [i.localizacao, i.prateleira, i.armario, i.setor].filter(Boolean).join(' / ') }
        ] }
    }

    if (tipo === 'lotes_vencer' || tipo === 'vencidos') {
        return { titulo, linhas: lotes.filter(l => tipo === 'vencidos' ? l._v.status === 'vencido' : ['atencao', 'critico'].includes(l._v.status)), colunas: [
            { t: 'Item', f: l => l.item?.nome || '' }, { t: 'Código', f: l => l.item?.codigo || '' },
            { t: 'Lote', c: 'codigo_lote' }, { t: 'Validade', c: 'data_validade' }, { t: 'Dias', f: l => l._v.dias },
            { t: 'Saldo', f: l => `${l.quantidade_atual} ${l.item?.unidade_medida || ''}`.trim() }, { t: 'Situação', f: l => l._v.label }
        ] }
    }

    if (tipo === 'consumo_setor') {
        const mapa = new Map()
        movs.filter(m => m.tipo === 'saida').forEach(m => {
            const setor = m.setor || m.destino || 'Não informado'
            if (!mapa.has(setor)) mapa.set(setor, { setor, movimentacoes: 0, itens: new Set() })
            const r = mapa.get(setor)
            r.movimentacoes += 1
            r.itens.add(m.item_id)
        })
        return { titulo, linhas: [...mapa.values()].map(r => ({ setor: r.setor, movimentacoes: r.movimentacoes, itens: r.itens.size })), colunas: [
            { t: 'Setor/finalidade', c: 'setor' }, { t: 'Movimentações de saída', c: 'movimentacoes' }, { t: 'Itens distintos', c: 'itens' }
        ] }
    }

    if (tipo === 'valoracao') {
        return { titulo, linhas: itens.filter(i => Number(i.custo_unitario) > 0), colunas: [
            { t: 'Código', c: 'codigo' }, { t: 'Item', c: 'nome' }, { t: 'Unidade', c: 'unidade_medida' },
            { t: 'Saldo', c: 'saldo_atual' }, { t: 'Custo unitário', f: i => formatarMoeda(i.custo_unitario) },
            { t: 'Valor estimado', f: i => formatarMoeda(Number(i.saldo_atual) * Number(i.custo_unitario)) }
        ] }
    }

    return { titulo, linhas: [], colunas: [] }
}

function valorRelatorio(coluna, linha) {
    const valor = typeof coluna.f === 'function' ? coluna.f(linha) : linha[coluna.c]
    return valor === null || valor === undefined || valor === '' ? '—' : valor
}

function previewRelatorio(tipo) {
    const rel = obterRelatorio(tipo)
    if (!rel.linhas.length) return '<div class="empty" style="padding:28px"><i class="fas fa-inbox"></i><p>Nenhum registro para este relatório.</p></div>'
    let h = `<div class="almox-lista-info">${sanitizar(rel.titulo)} — ${rel.linhas.length} registro(s)</div><div class="tw"><table aria-label="Prévia do relatório"><thead><tr>`
    rel.colunas.forEach(c => { h += `<th>${sanitizar(c.t)}</th>` })
    h += '</tr></thead><tbody>'
    rel.linhas.slice(0, 100).forEach(linha => {
        h += '<tr>' + rel.colunas.map(c => `<td>${sanitizar(valorRelatorio(c, linha))}</td>`).join('') + '</tr>'
    })
    h += '</tbody></table></div>'
    if (rel.linhas.length > 100) h += '<p class="almox-muted">Prévia limitada a 100 linhas. O CSV inclui todos os registros.</p>'
    return h
}

// ------------------------------------------------------------
// HELPERS DE UI
// ------------------------------------------------------------
function badgeEstoque(info) {
    const cls = info.status === 'sem_estoque' ? 'bg-err' : info.status === 'estoque_baixo' ? 'bg-warn' : 'bg-ok'
    return `<span class="badge ${cls}">${info.label}</span>`
}

function badgeValidade(info) {
    if (!info) return '<span class="almox-muted">—</span>'
    const cls = info.status === 'vencido' ? 'bg-err' : ['critico', 'atencao'].includes(info.status) ? 'bg-warn' : info.status === 'ok' ? 'bg-ok' : 'bg-info'
    return `<span class="badge ${cls}">${info.label}</span>`
}

function dataHora(valor) {
    if (!valor) return '—'
    const d = new Date(valor)
    if (Number.isNaN(d.getTime())) return '—'
    return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

function optionCategorias(selecionada = '', vazio = 'Sem categoria') {
    return `<option value="">${vazio}</option>` + estado.categorias.map(c => `<option value="${c.id}" ${selecionada === c.id ? 'selected' : ''}>${sanitizar(c.nome)}</option>`).join('')
}

function optionItens(selecionado = '', vazio = 'Selecione o item') {
    return `<option value="">${vazio}</option>` + estado.itens.map(i => `<option value="${i.id}" ${selecionado === i.id ? 'selected' : ''}>${sanitizar(i.codigo)} — ${sanitizar(i.nome)} (${formatarQuantidade(i.saldo_atual, i.unidade_medida)})</option>`).join('')
}

function optionLotes(itemId = '', vazio = 'Automático (FEFO / sem lote)') {
    const lotes = estado.lotes.filter(l => Number(l.quantidade_atual) > 0 && (!itemId || l.item_id === itemId))
    return `<option value="">${vazio}</option>` + lotes.map(l => `<option value="${l.id}">${sanitizar(l.item?.codigo || '')} · ${sanitizar(l.codigo_lote)} · ${l.data_validade ? fmtD(l.data_validade) : 'sem validade'} · ${formatarQuantidade(l.quantidade_atual, '')}</option>`).join('')
}

function optionFornecedores(selecionado = '') {
    return '<option value="">Sem fornecedor</option>' + estado.fornecedores.filter(f => f.ativo !== false).map(f => `<option value="${f.id}" ${selecionado === f.id ? 'selected' : ''}>${sanitizar(f.razao_social)}</option>`).join('')
}

function tituloModal(icone, titulo, subtitulo = '') {
    return `<button class="mdl-x" onclick="window.closeMdl()" aria-label="Fechar"><i class="fas fa-times"></i></button>
    <div class="almox-mdl-head"><span class="almox-mdl-ic"><i class="fas ${icone}"></i></span><div><h2>${sanitizar(titulo)}</h2>${subtitulo ? `<p>${sanitizar(subtitulo)}</p>` : ''}</div></div>`
}

function campo(rotulo, html, dica = '') {
    return `<label class="almox-field"><span>${sanitizar(rotulo)}</span>${html}${dica ? `<small>${sanitizar(dica)}</small>` : ''}</label>`
}

// ------------------------------------------------------------
// MODAIS
// ------------------------------------------------------------
function tipoControleItem(itemId) {
    return estado.itens.find(i => i.id === itemId)?.tipo_controle || ''
}

function atualizarCamposEntrada() {
    const controlaLote = tipoControleItem(document.getElementById('enItem')?.value) === 'lote'
    ;['enLote', 'enValidade', 'enFabricacao'].forEach(id => {
        const el = document.getElementById(id)
        if (!el) return
        el.disabled = !controlaLote
        if (!controlaLote) el.value = ''
    })
    const lote = document.getElementById('enLote')
    const validade = document.getElementById('enValidade')
    if (lote) lote.required = controlaLote
    if (validade) validade.required = controlaLote
    const ajuda = document.getElementById('enLoteAjuda')
    if (ajuda) ajuda.textContent = controlaLote ? 'Obrigatório para este item (controle por lote).' : 'Disponível apenas para itens com controle por lote.'
}

function atualizarLotesSaida() {
    const itemId = document.getElementById('saItem')?.value || ''
    const controlaLote = tipoControleItem(itemId) === 'lote'
    const sel = document.getElementById('saLote')
    if (!sel) return
    const anterior = sel.value
    sel.innerHTML = optionLotes(itemId, 'Automático (FEFO)')
    sel.disabled = !controlaLote
    if (!controlaLote) sel.value = ''
    else if (anterior && [...sel.options].some(o => o.value === anterior)) sel.value = anterior
}

function atualizarLotesAjuste() {
    const itemId = document.getElementById('ajItem')?.value || ''
    const controlaLote = tipoControleItem(itemId) === 'lote'
    const sel = document.getElementById('ajLote')
    if (!sel) return
    const anterior = sel.value
    sel.innerHTML = optionLotes(itemId, controlaLote ? 'Selecione o lote' : 'Saldo do item (sem lote)')
    sel.disabled = !controlaLote
    sel.required = controlaLote
    if (!controlaLote) sel.value = ''
    else if (anterior && [...sel.options].some(o => o.value === anterior)) sel.value = anterior
}

function modalItem(id = '') {
    const item = id ? estado.itens.find(i => i.id === id) : null
    const v = (campo, padrao = '') => sanitizar(item?.[campo] ?? padrao)

    openMdl(`${tituloModal('fa-box', item ? 'Editar item' : 'Novo item', 'Saldo inicial é zero; use Entrada para creditar.')}
    <form class="almox-form" onsubmit="event.preventDefault();window.almoxSalvarItem('${id}')">
        <div class="almox-form-grid">
            ${campo('Código/SKU *', `<input id="itCodigo" required maxlength="40" value="${v('codigo')}" placeholder="EX-001">`)}
            ${campo('Nome *', `<input id="itNome" required maxlength="120" value="${v('nome')}" placeholder="Nome do material">`)}
            ${campo('Categoria', `<select id="itCategoria">${optionCategorias(item?.categoria_id || '', 'Sem categoria')}</select>`)}
            ${campo('Unidade *', `<select id="itUnidade">${UNIDADES_MEDIDA.map(u => `<option value="${u}" ${(item?.unidade_medida || 'UN') === u ? 'selected' : ''}>${u}</option>`).join('')}</select>`)}
            ${campo('Tipo de controle', `<select id="itTipo">${TIPOS_CONTROLE.map(t => `<option value="${t.id}" ${(item?.tipo_controle || 'quantidade') === t.id ? 'selected' : ''}>${t.nome}</option>`).join('')}</select>`)}
            ${campo('Situação', `<select id="itSituacao">${SITUACOES_ITEM.map(s => `<option value="${s}" ${(item?.situacao || 'ativo') === s ? 'selected' : ''}>${s}</option>`).join('')}</select>`)}
            ${campo('Estoque mínimo', `<input id="itMin" type="number" min="0" step="0.001" value="${v('estoque_minimo', 0)}">`)}
            ${campo('Estoque máximo', `<input id="itMax" type="number" min="0" step="0.001" value="${v('estoque_maximo')}">`)}
            ${campo('Custo unitário (R$)', `<input id="itCusto" type="number" min="0" step="0.0001" value="${v('custo_unitario')}">`)}
            ${campo('Fornecedor padrão', `<select id="itFornecedor">${optionFornecedores(item?.fornecedor_padrao_id || '')}</select>`)}
            ${campo('Marca', `<input id="itMarca" maxlength="80" value="${v('marca')}">`)}
            ${campo('Modelo', `<input id="itModelo" maxlength="80" value="${v('modelo')}">`)}
            ${campo('Nº de série', `<input id="itSerie" maxlength="80" value="${v('numero_serie')}">`)}
            ${campo('Patrimônio', `<input id="itPatrimonio" maxlength="80" value="${v('patrimonio')}">`)}
            ${campo('Localização', `<input id="itLocal" maxlength="120" value="${v('localizacao')}" placeholder="Sala, corredor...">`)}
            ${campo('Prateleira', `<input id="itPrateleira" maxlength="60" value="${v('prateleira')}">`)}
            ${campo('Armário', `<input id="itArmario" maxlength="60" value="${v('armario')}">`)}
            ${campo('Setor', `<input id="itSetor" maxlength="80" value="${v('setor')}">`)}
        </div>
        ${campo('Descrição', `<textarea id="itDescricao" rows="2" maxlength="500">${v('descricao')}</textarea>`)}
        ${campo('Observações', `<textarea id="itObs" rows="2" maxlength="500">${v('observacoes')}</textarea>`)}
        <div class="almox-form-actions"><button type="button" class="btn btn-s" onclick="window.closeMdl()">Cancelar</button><button type="submit" class="btn btn-p" id="itSalvar"><i class="fas fa-floppy-disk"></i> Salvar item</button></div>
    </form>`)
}

function modalEntrada(itemId = '') {
    openMdl(`${tituloModal('fa-arrow-down', 'Registrar entrada', 'Credita saldo e cria/atualiza o lote.')}
    <form class="almox-form" onsubmit="event.preventDefault();window.almoxSalvarEntrada()">
        ${campo('Item *', `<select id="enItem" required onchange="window.almoxAtualizarCamposEntrada()">${optionItens(itemId)}</select>`)}
        <div class="almox-form-grid">
            ${campo('Quantidade *', '<input id="enQtd" type="number" min="0.001" step="0.001" required>')}
            ${campo('Custo unitário (R$)', '<input id="enCusto" type="number" min="0" step="0.0001">')}
            ${campo('Lote', '<input id="enLote" maxlength="60" placeholder="Ex.: L2026-01"><small id="enLoteAjuda">Obrigatório para itens com controle por lote.</small>')}
            ${campo('Validade', '<input id="enValidade" type="date"><small>Obrigatória para itens com controle por lote.</small>')}
            ${campo('Fabricação', '<input id="enFabricacao" type="date">')}
            ${campo('Fornecedor', `<select id="enFornecedor">${optionFornecedores()}</select>`)}
            ${campo('Documento/NF', '<input id="enDocumento" maxlength="80">')}
            ${campo('Responsável', `<input id="enResponsavel" maxlength="120" value="${sanitizar(S.user?.nome_completo || S.user?.email || '')}">`)}
        </div>
        ${campo('Observações', '<textarea id="enObs" rows="2" maxlength="500"></textarea>')}
        <div class="almox-form-actions"><button type="button" class="btn btn-s" onclick="window.closeMdl()">Cancelar</button><button type="submit" class="btn btn-p"><i class="fas fa-arrow-down"></i> Registrar entrada</button></div>
    </form>`)
    atualizarCamposEntrada()
}

function modalSaida(itemId = '', loteId = '') {
    openMdl(`${tituloModal('fa-arrow-up', 'Registrar saída', 'Debita saldo. Lotes vencidos são bloqueados.')}
    <form class="almox-form" onsubmit="event.preventDefault();window.almoxSalvarSaida()">
        ${campo('Item *', `<select id="saItem" required onchange="window.almoxAtualizarLotesSaida()">${optionItens(itemId)}</select>`)}
        <div class="almox-form-grid">
            ${campo('Quantidade *', '<input id="saQtd" type="number" min="0.001" step="0.001" required>')}
            ${campo('Lote', `<select id="saLote" disabled>${optionLotes(itemId, 'Automático (FEFO)')}</select>`)}
            ${campo('Motivo *', '<input id="saMotivo" maxlength="160" required placeholder="Aula prática, manutenção...">')}
            ${campo('Destino', '<input id="saDestino" maxlength="120">')}
            ${campo('Setor', '<input id="saSetor" maxlength="80">')}
            ${campo('Responsável', `<input id="saResponsavel" maxlength="120" value="${sanitizar(S.user?.nome_completo || S.user?.email || '')}">`)}
        </div>
        ${campo('Observações', '<textarea id="saObs" rows="2" maxlength="500"></textarea>')}
        <div class="almox-form-actions"><button type="button" class="btn btn-s" onclick="window.closeMdl()">Cancelar</button><button type="submit" class="btn btn-g"><i class="fas fa-arrow-up"></i> Registrar saída</button></div>
    </form>`)
    atualizarLotesSaida()
    if (loteId) {
        const sel = document.getElementById('saLote')
        if (sel) sel.value = loteId
    }
}

function modalAjuste(itemId = '', loteId = '') {
    openMdl(`${tituloModal('fa-sliders', 'Ajuste de inventário', 'Define a quantidade real contada. Gera movimentação auditável.')}
    <form class="almox-form" onsubmit="event.preventDefault();window.almoxSalvarAjuste()">
        ${campo('Item *', `<select id="ajItem" required onchange="window.almoxAtualizarLotesAjuste()">${optionItens(itemId)}</select>`)}
        <div class="almox-form-grid">
            ${campo('Lote', `<select id="ajLote" disabled>${optionLotes(itemId, 'Saldo do item (sem lote)')}</select>`)}
            ${campo('Tipo', `<select id="ajTipo"><option value="ajuste">Ajuste de inventário</option><option value="perda">Perda/Avaria</option><option value="descarte">Descarte</option></select>`)}
            ${campo('Nova quantidade *', '<input id="ajQtd" type="number" min="0" step="0.001" required>')}
            ${campo('Responsável', `<input id="ajResponsavel" maxlength="120" value="${sanitizar(S.user?.nome_completo || S.user?.email || '')}">`)}
        </div>
        ${campo('Motivo *', '<textarea id="ajMotivo" rows="2" maxlength="300" required></textarea>')}
        ${campo('Observações', '<textarea id="ajObs" rows="2" maxlength="500"></textarea>')}
        <div class="almox-form-actions"><button type="button" class="btn btn-s" onclick="window.closeMdl()">Cancelar</button><button type="submit" class="btn btn-p"><i class="fas fa-sliders"></i> Aplicar ajuste</button></div>
    </form>`)
    atualizarLotesAjuste()
    if (loteId) {
        const sel = document.getElementById('ajLote')
        if (sel) sel.value = loteId
    }
}

function modalTransferencia(itemId = '') {
    openMdl(`${tituloModal('fa-location-dot', 'Transferir localização', 'Atualiza a localização física e registra a movimentação.')}
    <form class="almox-form" onsubmit="event.preventDefault();window.almoxSalvarTransferencia()">
        ${campo('Item *', `<select id="trItem" required>${optionItens(itemId)}</select>`)}
        <div class="almox-form-grid">
            ${campo('Localização', '<input id="trLocal" maxlength="120">')}
            ${campo('Prateleira', '<input id="trPrateleira" maxlength="60">')}
            ${campo('Armário', '<input id="trArmario" maxlength="60">')}
            ${campo('Setor', '<input id="trSetor" maxlength="80">')}
            ${campo('Motivo *', '<input id="trMotivo" maxlength="160" required>')}
            ${campo('Responsável', `<input id="trResponsavel" maxlength="120" value="${sanitizar(S.user?.nome_completo || S.user?.email || '')}">`)}
        </div>
        <div class="almox-form-actions"><button type="button" class="btn btn-s" onclick="window.closeMdl()">Cancelar</button><button type="submit" class="btn btn-p"><i class="fas fa-location-dot"></i> Transferir</button></div>
    </form>`)
}

function modalFornecedor(id = '') {
    const f = id ? estado.fornecedores.find(x => x.id === id) : null
    const v = (campo, padrao = '') => sanitizar(f?.[campo] ?? padrao)
    openMdl(`${tituloModal('fa-truck-field', f ? 'Editar fornecedor' : 'Novo fornecedor')}
    <form class="almox-form" onsubmit="event.preventDefault();window.almoxSalvarFornecedor('${id}')">
        ${campo('Razão social *', `<input id="foRazao" required maxlength="160" value="${v('razao_social')}">`)}
        <div class="almox-form-grid">
            ${campo('Nome fantasia', `<input id="foFantasia" maxlength="160" value="${v('nome_fantasia')}">`)}
            ${campo('CNPJ', `<input id="foCnpj" maxlength="20" value="${v('cnpj')}">`)}
            ${campo('Telefone', `<input id="foTelefone" maxlength="30" value="${v('telefone')}">`)}
            ${campo('E-mail', `<input id="foEmail" type="email" maxlength="120" value="${v('email')}">`)}
        </div>
        ${campo('Endereço', `<input id="foEndereco" maxlength="200" value="${v('endereco')}">`)}
        ${campo('Observações', `<textarea id="foObs" rows="2" maxlength="500">${v('observacoes')}</textarea>`)}
        <div class="almox-form-actions"><button type="button" class="btn btn-s" onclick="window.closeMdl()">Cancelar</button><button type="submit" class="btn btn-p"><i class="fas fa-floppy-disk"></i> Salvar</button></div>
    </form>`)
}

function modalCategorias() {
    openMdl(`${tituloModal('fa-tags', 'Categorias', 'Organize os materiais por grupo.')}
    <div class="almox-cat-lista">${estado.categorias.length ? estado.categorias.map(c => `<div class="almox-cat-item"><div><strong>${sanitizar(c.nome)}</strong>${c.descricao ? `<br><span class="almox-muted">${sanitizar(c.descricao)}</span>` : ''}</div><button type="button" class="btn btn-sm btn-d" onclick="window.almoxExcluirCategoria('${c.id}')" aria-label="Excluir categoria"><i class="fas fa-trash"></i></button></div>`).join('') : '<p class="almox-muted">Nenhuma categoria cadastrada.</p>'}</div>
    <form class="almox-form" onsubmit="event.preventDefault();window.almoxSalvarCategoria()">
        <div class="almox-form-grid">
            ${campo('Nome *', '<input id="catNome" required maxlength="80">')}
            ${campo('Descrição', '<input id="catDesc" maxlength="200">')}
        </div>
        <div class="almox-form-actions"><button type="button" class="btn btn-s" onclick="window.closeMdl()">Fechar</button><button type="submit" class="btn btn-p"><i class="fas fa-plus"></i> Adicionar categoria</button></div>
    </form>`)
}

function modalEstorno(id) {
    const mov = estado.movimentacoes.find(m => m.id === id)
    openMdl(`${tituloModal('fa-rotate-left', 'Estornar movimentação', 'O saldo será revertido e o fato ficará registrado na auditoria.')}
    <div class="almox-resumo-mov">${mov ? `<p><strong>${labelMovimentacao(mov.tipo)}</strong> · ${sanitizar(mov.item?.nome || '')} · ${formatarQuantidade(mov.quantidade, mov.item?.unidade_medida || '')}</p><p class="almox-muted">${dataHora(mov.data_hora)} · ${sanitizar(mov.responsavel || '')}</p>` : ''}</div>
    <form class="almox-form" onsubmit="event.preventDefault();window.almoxConfirmarEstorno('${id}')">
        ${campo('Motivo do estorno *', '<textarea id="estMotivo" rows="2" maxlength="300" required></textarea>')}
        <div class="almox-form-actions"><button type="button" class="btn btn-s" onclick="window.closeMdl()">Cancelar</button><button type="submit" class="btn btn-g"><i class="fas fa-rotate-left"></i> Confirmar estorno</button></div>
    </form>`)
}

// ------------------------------------------------------------
// AÇÕES
// ------------------------------------------------------------
let salvando = false

async function executar(acao, mensagemSucesso) {
    if (salvando) return false
    salvando = true
    try {
        const { error } = await acao()
        if (error) { toast(error.message || 'Não foi possível concluir a operação.', 'err'); return false }
        toast(mensagemSucesso, 'success')
        closeMdl()
        await recarregar()
        return true
    } finally {
        salvando = false
    }
}

async function recarregar() {
    estado.carregado = false
    await carregarAlmox()
}

function valoresItem() {
    return {
        codigo: document.getElementById('itCodigo')?.value,
        nome: document.getElementById('itNome')?.value,
        descricao: document.getElementById('itDescricao')?.value,
        categoria_id: document.getElementById('itCategoria')?.value,
        marca: document.getElementById('itMarca')?.value,
        modelo: document.getElementById('itModelo')?.value,
        unidade_medida: document.getElementById('itUnidade')?.value,
        tipo_controle: document.getElementById('itTipo')?.value,
        estoque_minimo: document.getElementById('itMin')?.value,
        estoque_maximo: document.getElementById('itMax')?.value,
        localizacao: document.getElementById('itLocal')?.value,
        prateleira: document.getElementById('itPrateleira')?.value,
        armario: document.getElementById('itArmario')?.value,
        setor: document.getElementById('itSetor')?.value,
        fornecedor_padrao_id: document.getElementById('itFornecedor')?.value,
        custo_unitario: document.getElementById('itCusto')?.value,
        numero_serie: document.getElementById('itSerie')?.value,
        patrimonio: document.getElementById('itPatrimonio')?.value,
        situacao: document.getElementById('itSituacao')?.value,
        observacoes: document.getElementById('itObs')?.value
    }
}

async function salvarItem(id) {
    const dados = valoresItem()
    const validacao = validarItem(dados)
    if (!validacao.ok) {
        toast(Object.values(validacao.erros)[0] || 'Revise os dados do item.', 'err')
        return
    }
    await executar(() => id ? almoxAtualizarItem(id, dados) : almoxCriarItem(dados), id ? 'Item atualizado.' : 'Item cadastrado.')
}

async function excluirItem(id) {
    const item = estado.itens.find(i => i.id === id)
    if (!item) return
    if (!window.confirm(`Excluir “${item.nome}”? Esta ação não pode ser desfeita. Itens com movimentações não podem ser excluídos.`)) return
    await executar(() => almoxRemoverItem(id), 'Item excluído.')
}

async function salvarEntrada() {
    const qtd = validarQuantidade(document.getElementById('enQtd')?.value)
    if (!qtd.ok) return toast(qtd.erro, 'err')
    const dados = {
        item_id: document.getElementById('enItem')?.value,
        quantidade: qtd.valor,
        custo_unitario: document.getElementById('enCusto')?.value,
        lote: document.getElementById('enLote')?.value,
        validade: document.getElementById('enValidade')?.value,
        fabricacao: document.getElementById('enFabricacao')?.value,
        fornecedor_id: document.getElementById('enFornecedor')?.value,
        documento: document.getElementById('enDocumento')?.value,
        responsavel: document.getElementById('enResponsavel')?.value,
        observacoes: document.getElementById('enObs')?.value
    }
    if (!dados.item_id) return toast('Selecione o item.', 'err')
    if (tipoControleItem(dados.item_id) === 'lote') {
        if (!String(dados.lote || '').trim()) return toast('Informe o lote deste material.', 'err')
        if (!dados.validade) return toast('Informe a validade deste lote.', 'err')
    }
    await executar(() => almoxRegistrarEntrada(dados), 'Entrada registrada.')
}

async function salvarSaida() {
    const qtd = validarQuantidade(document.getElementById('saQtd')?.value)
    if (!qtd.ok) return toast(qtd.erro, 'err')
    const dados = {
        item_id: document.getElementById('saItem')?.value,
        quantidade: qtd.valor,
        lote_id: document.getElementById('saLote')?.value,
        motivo: document.getElementById('saMotivo')?.value,
        destino: document.getElementById('saDestino')?.value,
        setor: document.getElementById('saSetor')?.value,
        responsavel: document.getElementById('saResponsavel')?.value,
        observacoes: document.getElementById('saObs')?.value
    }
    if (!dados.item_id) return toast('Selecione o item.', 'err')
    if (!String(dados.motivo || '').trim()) return toast('Informe o motivo da saída.', 'err')
    await executar(() => almoxRegistrarSaida(dados), 'Saída registrada.')
}

async function salvarAjuste() {
    const qtd = validarQuantidade(document.getElementById('ajQtd')?.value, { permitirZero: true })
    if (!qtd.ok) return toast(qtd.erro, 'err')
    const dados = {
        item_id: document.getElementById('ajItem')?.value,
        lote_id: document.getElementById('ajLote')?.value,
        nova_quantidade: qtd.valor,
        tipo: document.getElementById('ajTipo')?.value,
        motivo: document.getElementById('ajMotivo')?.value,
        responsavel: document.getElementById('ajResponsavel')?.value,
        observacoes: document.getElementById('ajObs')?.value
    }
    if (!dados.item_id) return toast('Selecione o item.', 'err')
    if (!String(dados.motivo || '').trim()) return toast('Informe o motivo do ajuste.', 'err')
    if (tipoControleItem(dados.item_id) === 'lote' && !dados.lote_id) return toast('Selecione o lote deste material.', 'err')
    await executar(() => almoxRegistrarAjuste(dados), 'Ajuste aplicado.')
}

async function salvarTransferencia() {
    const dados = {
        item_id: document.getElementById('trItem')?.value,
        localizacao: document.getElementById('trLocal')?.value,
        prateleira: document.getElementById('trPrateleira')?.value,
        armario: document.getElementById('trArmario')?.value,
        setor: document.getElementById('trSetor')?.value,
        motivo: document.getElementById('trMotivo')?.value,
        responsavel: document.getElementById('trResponsavel')?.value
    }
    if (!dados.item_id) return toast('Selecione o item.', 'err')
    if (!String(dados.motivo || '').trim()) return toast('Informe o motivo da transferência.', 'err')
    await executar(() => almoxTransferir(dados), 'Localização atualizada.')
}

async function salvarFornecedor(id) {
    const dados = {
        razao_social: document.getElementById('foRazao')?.value,
        nome_fantasia: document.getElementById('foFantasia')?.value,
        cnpj: document.getElementById('foCnpj')?.value,
        telefone: document.getElementById('foTelefone')?.value,
        email: document.getElementById('foEmail')?.value,
        endereco: document.getElementById('foEndereco')?.value,
        observacoes: document.getElementById('foObs')?.value
    }
    if (!String(dados.razao_social || '').trim()) return toast('Informe a razão social.', 'err')
    await executar(() => almoxSalvarFornecedor({ ...dados, id: id || undefined }), id ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.')
}

async function alternarFornecedor(id, ativo) {
    await executar(() => almoxAlternarFornecedor(id, ativo), ativo ? 'Fornecedor reativado.' : 'Fornecedor desativado.')
}

async function salvarCategoria() {
    const nome = document.getElementById('catNome')?.value
    if (!String(nome || '').trim()) return toast('Informe o nome da categoria.', 'err')
    const { data, error } = await almoxSalvarCategoria({ nome, descricao: document.getElementById('catDesc')?.value })
    if (error) return toast(error.message || 'Não foi possível salvar a categoria.', 'err')
    toast('Categoria salva.', 'success')
    await recarregar()
    modalCategorias()
}

async function excluirCategoria(id) {
    if (!window.confirm('Excluir esta categoria? Os itens vinculados ficarão sem categoria.')) return
    const { error } = await almoxRemoverCategoria(id)
    if (error) return toast(error.message || 'Não foi possível excluir a categoria.', 'err')
    toast('Categoria excluída.', 'success')
    await recarregar()
    modalCategorias()
}

async function confirmarEstorno(id) {
    const motivo = document.getElementById('estMotivo')?.value
    if (!String(motivo || '').trim()) return toast('Informe o motivo do estorno.', 'err')
    await executar(() => almoxEstornarMovimentacao(id, motivo), 'Movimentação estornada.')
}

// ------------------------------------------------------------
// FILTROS E NAVEGAÇÃO
// ------------------------------------------------------------
function setAba(aba) {
    estado.aba = aba
    renderTela()
}

function setPeriodo(valor) {
    estado.periodo = Math.max(1, Number(valor) || 30)
    localStorage.setItem(CK_PERIODO, String(estado.periodo))
    recarregar()
}

function setAlertaDias(valor) {
    estado.alertaDias = Math.max(1, Math.min(365, Number(valor) || 30))
    localStorage.setItem(CK_ALERTA, String(estado.alertaDias))
    renderTela()
}

function pagina(prefixo, numero) {
    if (prefixo === 'itens') {
        estado.paginaItens = Math.max(1, Number(numero) || 1)
        const alvo = document.getElementById('almoxItensTabela')
        if (alvo) alvo.innerHTML = tabelaItens()
        window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
        estado.paginaMovs = Math.max(1, Number(numero) || 1)
        const alvo = document.getElementById('almoxMovTabela')
        if (alvo) alvo.innerHTML = tabelaMovsPaginada()
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }
}

function aplicarFiltrosVisao() {
    estado.filtrosVisao = {
        categoria_id: document.getElementById('filtroVisaoCategoria')?.value || '',
        situacao: document.getElementById('filtroVisaoSituacao')?.value || '',
        local: document.getElementById('filtroVisaoLocal')?.value || ''
    }
    renderTela()
}

function limparFiltrosVisao() {
    estado.filtrosVisao = { categoria_id: '', situacao: '', local: '' }
    renderTela()
}

function aplicarFiltrosItens() {
    estado.filtrosItens = {
        busca: document.getElementById('filtroItemBusca')?.value || '',
        categoria_id: document.getElementById('filtroItemCategoria')?.value || '',
        situacao_estoque: document.getElementById('filtroItemEstoque')?.value || '',
        tipo_controle: document.getElementById('filtroItemTipo')?.value || '',
        situacao: document.getElementById('filtroItemSituacao')?.value || ''
    }
    estado.paginaItens = 1
    const alvo = document.getElementById('almoxItensTabela')
    if (alvo) alvo.innerHTML = tabelaItens()
}

function aplicarFiltrosMovs() {
    estado.filtrosMovs = {
        tipo: document.getElementById('filtroMovTipo')?.value || '',
        item_id: document.getElementById('filtroMovItem')?.value || '',
        lote_id: document.getElementById('filtroMovLote')?.value || '',
        usuario: document.getElementById('filtroMovUsuario')?.value || '',
        de: document.getElementById('filtroMovDe')?.value || '',
        ate: document.getElementById('filtroMovAte')?.value || ''
    }
    estado.paginaMovs = 1
    const alvo = document.getElementById('almoxMovTabela')
    if (alvo) alvo.innerHTML = tabelaMovsPaginada()
}

function limparFiltrosMovs() {
    estado.filtrosMovs = { tipo: '', item_id: '', lote_id: '', usuario: '', de: '', ate: '' }
    estado.paginaMovs = 1
    renderTela()
}

function aplicarFiltrosLotes() {
    estado.filtrosLotes = {
        item_id: document.getElementById('filtroLoteItem')?.value || '',
        de: document.getElementById('filtroLoteDe')?.value || '',
        ate: document.getElementById('filtroLoteAte')?.value || ''
    }
    const alvo = document.getElementById('almoxLotesTabela')
    if (alvo) alvo.innerHTML = tabelaLotes()
}

function limparFiltrosLotes() {
    estado.filtrosLotes = { item_id: '', de: '', ate: '' }
    renderTela()
}

// ------------------------------------------------------------
// RELATÓRIOS
// ------------------------------------------------------------
function verRelatorio(tipo) {
    const alvo = document.getElementById('almoxRelatorioPreview')
    if (alvo) alvo.innerHTML = previewRelatorio(tipo)
}

function exportarRelatorio(tipo) {
    const rel = obterRelatorio(tipo)
    if (!rel.linhas.length) return toast('Nenhum registro para exportar.', 'warn')
    const colunas = rel.colunas.map(c => ({
        titulo: c.t,
        valor: typeof c.f === 'function' ? c.f : (linha) => linha[c.c]
    }))
    const csv = gerarCSV(rel.linhas, colunas)
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nomeArquivoCSV(`almox_${tipo}`)
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast('CSV gerado.', 'success')
}

function imprimirRelatorio(tipo) {
    const rel = obterRelatorio(tipo)
    if (!rel.linhas.length) return toast('Nenhum registro para imprimir.', 'warn')
    const linhas = rel.linhas.map(linha => `<tr>${rel.colunas.map(c => `<td>${sanitizar(valorRelatorio(c, linha))}</td>`).join('')}</tr>`).join('')
    const janela = window.open('', '_blank')
    if (!janela) return toast('Permita pop-ups para imprimir.', 'warn')
    janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${sanitizar(rel.titulo)}</title>
    <style>body{font-family:Inter,Arial,sans-serif;color:#111;padding:24px}h1{font-size:19px;margin:0 0 4px}p{font-size:12px;color:#555;margin:0 0 16px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}th{background:#eee}@media print{@page{size:landscape;margin:12mm}}</style></head>
    <body><h1>${sanitizar(rel.titulo)}</h1><p>SulSafe Estudos · Almoxarifado · emitido em ${new Date().toLocaleString('pt-BR')} · ${rel.linhas.length} registro(s)</p>
    <table><thead><tr>${rel.colunas.map(c => `<th>${sanitizar(c.t)}</th>`).join('')}</tr></thead><tbody>${linhas}</tbody></table>
    <script>window.onload=function(){window.print()}<\/script></body></html>`)
    janela.document.close()
}

// ------------------------------------------------------------
// EXPOSIÇÃO GLOBAL (padrão do projeto para handlers inline)
// ------------------------------------------------------------
window.almoxSetAba = setAba
window.almoxAtualizar = recarregar
window.almoxSetPeriodo = setPeriodo
window.almoxSetAlertaDias = setAlertaDias
window.almoxPagina = pagina
window.almoxAplicarFiltrosVisao = aplicarFiltrosVisao
window.almoxLimparFiltrosVisao = limparFiltrosVisao
window.almoxAplicarFiltrosItens = aplicarFiltrosItens
window.almoxAplicarFiltrosMovs = aplicarFiltrosMovs
window.almoxLimparFiltrosMovs = limparFiltrosMovs
window.almoxAplicarFiltrosLotes = aplicarFiltrosLotes
window.almoxLimparFiltrosLotes = limparFiltrosLotes
window.almoxModalItem = modalItem
window.almoxModalEntrada = modalEntrada
window.almoxAtualizarCamposEntrada = atualizarCamposEntrada
window.almoxAtualizarLotesSaida = atualizarLotesSaida
window.almoxAtualizarLotesAjuste = atualizarLotesAjuste
window.almoxModalSaida = modalSaida
window.almoxModalAjuste = modalAjuste
window.almoxModalTransferencia = modalTransferencia
window.almoxModalFornecedor = modalFornecedor
window.almoxModalCategorias = modalCategorias
window.almoxModalEstorno = modalEstorno
window.almoxSalvarItem = salvarItem
window.almoxExcluirItem = excluirItem
window.almoxSalvarEntrada = salvarEntrada
window.almoxSalvarSaida = salvarSaida
window.almoxSalvarAjuste = salvarAjuste
window.almoxSalvarTransferencia = salvarTransferencia
window.almoxSalvarFornecedor = salvarFornecedor
window.almoxAlternarFornecedor = alternarFornecedor
window.almoxSalvarCategoria = salvarCategoria
window.almoxExcluirCategoria = excluirCategoria
window.almoxConfirmarEstorno = confirmarEstorno
window.almoxVerRelatorio = verRelatorio
window.almoxExportarRelatorio = exportarRelatorio
window.almoxImprimirRelatorio = imprimirRelatorio
