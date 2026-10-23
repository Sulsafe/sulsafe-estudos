// ============================================================
// VIEW: CENTRAL ADMINISTRATIVA (MODO DEUS)
// Painel amplo que reutiliza os gráficos e indicadores existentes.
// ============================================================
import { S, isAdmin, fmtD } from '../state.js'
import { sb, sbGetDashboardMetrics, sbGetAllUsers, sbGetRankingAlunos } from '../supabase-client.js'
import { toast, sanitizar, handleError } from '../utils.js'
import {
    drawAdminProgress,
    drawAdminRoles,
    drawMatriculasEvolucao,
    drawDonut,
    destroyChartsAdmin
} from '../charts-admin.js'
import { almoxGetResumo } from '../almoxarifado.js'
import { calcularResumoEstoque } from '../almoxarifado-rules.js'

export function vCentral() {
    if (!isAdmin()) return window.nav('inicio')

    let h = `
    <div class="adm-hero">
        <div class="adm-hero-main">
            <span class="adm-eyebrow"><i class="fas fa-shield-halved"></i> Área administrativa</span>
            <h1>Central Administrativa</h1>
            <p>Visão consolidada da plataforma, indicadores acadêmicos, pendências e operação do almoxarifado.</p>
            <span class="adm-user"><i class="fas fa-user-shield"></i> ${sanitizar(S.user?.nome_completo || 'Administrador')} · ${sanitizar(S.user?.email || '')}</span>
        </div>
        <div class="adm-hero-actions">
            <button type="button" class="btn btn-s" onclick="window.centralAtualizar()"><i class="fas fa-rotate"></i> Atualizar</button>
            <button type="button" class="btn btn-g" onclick="window.nav('admin')"><i class="fas fa-sliders"></i> Modo Deus</button>
            <button type="button" class="btn btn-p" onclick="window.nav('almoxarifado')"><i class="fas fa-boxes-stacked"></i> Almoxarifado</button>
        </div>
    </div>

    <h2 class="adm-section-title"><i class="fas fa-chart-pie"></i> Indicadores gerais</h2>
    <div id="centralKpis" class="kpi-grid" aria-live="polite">
        <div class="empty" style="grid-column:1/-1"><i class="fas fa-spinner fa-spin"></i><p>Carregando indicadores...</p></div>
    </div>

    <div id="centralAlerts" class="adm-alerts" aria-live="polite"></div>

    <h2 class="adm-section-title"><i class="fas fa-chart-column"></i> Evolução e distribuição</h2>
    <div class="chart-grid">
        <section class="chart-card">
            <header><h3><i class="fas fa-chart-bar"></i> Alunos por progresso</h3><span class="chart-hint">Progresso nas videoaulas</span></header>
            <div class="chart-canvas"><canvas id="chartCentralProgresso" role="img" aria-label="Gráfico de alunos por faixa de progresso"></canvas></div>
        </section>
        <section class="chart-card">
            <header><h3><i class="fas fa-users"></i> Usuários por perfil</h3><span class="chart-hint">Distribuição de papéis</span></header>
            <div class="chart-canvas"><canvas id="chartCentralRoles" role="img" aria-label="Gráfico de usuários por perfil"></canvas></div>
        </section>
        <section class="chart-card">
            <header><h3><i class="fas fa-user-plus"></i> Evolução de matrículas</h3><span class="chart-hint">Acumulado dos últimos 12 meses</span></header>
            <div class="chart-canvas"><canvas id="chartCentralMatriculas" role="img" aria-label="Gráfico de evolução de matrículas"></canvas></div>
        </section>
        <section class="chart-card">
            <header><h3><i class="fas fa-certificate"></i> Certificados</h3><span class="chart-hint">Emitidos e revogados</span></header>
            <div class="chart-canvas"><canvas id="chartCentralCerts" role="img" aria-label="Gráfico de certificados emitidos e revogados"></canvas></div>
        </section>
    </div>

    <div class="adm-split">
        <section class="pnl">
            <div class="pnl-h"><div class="pnl-t"><i class="fas fa-list-check"></i> Resumo operacional</div></div>
            <div id="centralResumo" class="adm-resumo"><div class="loading"><i class="fas fa-spinner fa-spin"></i></div></div>
        </section>
        <section class="pnl">
            <div class="pnl-h"><div class="pnl-t"><i class="fas fa-bolt"></i> Acesso rápido</div></div>
            <div class="quick-grid">
                <button type="button" class="quick-card" onclick="window.nav('pendentes')"><i class="fas fa-user-clock"></i><span>Aprovações</span></button>
                <button type="button" class="quick-card" onclick="window.nav('admin')"><i class="fas fa-sliders"></i><span>Modo Deus</span></button>
                <button type="button" class="quick-card" onclick="window.nav('almoxarifado')"><i class="fas fa-boxes-stacked"></i><span>Almoxarifado</span></button>
                <button type="button" class="quick-card" onclick="window.nav('certificados')"><i class="fas fa-award"></i><span>Certificados</span></button>
                <button type="button" class="quick-card" onclick="window.nav('provas')"><i class="fas fa-file-signature"></i><span>Correções</span></button>
                <button type="button" class="quick-card" onclick="window.nav('forum')"><i class="fas fa-comments"></i><span>Fórum</span></button>
                <button type="button" class="quick-card" onclick="window.nav('professor')"><i class="fas fa-chalkboard-user"></i><span>Área do Professor</span></button>
                <button type="button" class="quick-card" onclick="window.nav('config')"><i class="fas fa-gear"></i><span>Configurações</span></button>
            </div>
        </section>
    </div>
    `

    setTimeout(carregarCentral, 80)
    return h
}

function kpi(icone, valor, rotulo, detalhe = '', variante = '') {
    return `
        <div class="kpi ${variante}">
            <div class="kpi-ic"><i class="fas ${icone}"></i></div>
            <div class="kpi-info">
                <div class="kpi-v">${valor}</div>
                <div class="kpi-l">${rotulo}</div>
                ${detalhe ? `<div class="kpi-d">${detalhe}</div>` : ''}
            </div>
        </div>
    `
}

function contarPorStatus(provas) {
    const resumo = { pendente: 0, corrigido: 0, reprovado: 0, total: 0 }
    ;(provas || []).forEach(p => {
        if (resumo[p.status] === undefined) resumo[p.status] = 0
        resumo[p.status] += 1
        resumo.total += 1
    })
    return resumo
}

async function carregarCentral() {
    const kpis = document.getElementById('centralKpis')
    const alertas = document.getElementById('centralAlerts')
    const resumo = document.getElementById('centralResumo')
    if (!kpis) return

    try {
        const [
            metricsRes,
            usersRes,
            rankingRes,
            certsRes,
            provasRes,
            forumRes,
            salasRes,
            almoxRes
        ] = await Promise.all([
            sbGetDashboardMetrics(),
            sbGetAllUsers(0, 1000),
            sbGetRankingAlunos(),
            sb.from('certificados').select('*').limit(2000),
            sb.from('provas').select('status, nota, criado_em').limit(2000),
            sb.from('mensagens_forum').select('id', { count: 'exact', head: true }),
            sb.from('salas').select('id', { count: 'exact', head: true }).eq('ativa', true),
            almoxGetResumo()
        ])

        const metrics = metricsRes.data || {}
        const usuarios = usersRes.data || []
        const ranking = rankingRes.data || []
        const certificados = certsRes.data || []
        const provas = provasRes.data || []
        const provasResumo = contarPorStatus(provas)
        const forumTotal = forumRes.count || 0
        const salasAtivas = salasRes.count || 0

        const totalUsuarios = metrics.total_usuarios ?? usuarios.length
        const totalAlunos = metrics.total_alunos ?? usuarios.filter(u => u.role === 'aluno').length
        const totalProfessores = metrics.total_professores ?? usuarios.filter(u => u.role === 'professor').length
        const pendentes = metrics.pendentes ?? usuarios.filter(u => u.status === 'pendente' && u.role === 'aluno').length
        const provasPendentes = metrics.provas_pendentes ?? provasResumo.pendente
        const aulasConcluidas = metrics.total_concluidas ?? 0

        const certEmitidos = certificados.filter(c => c.revogado !== true).length
        const certRevogados = certificados.filter(c => c.revogado === true).length

        let almox = null
        if (almoxRes.data) {
            const resumoEstoque = calcularResumoEstoque(almoxRes.data.itens, almoxRes.data.lotes)
            almox = {
                ...resumoEstoque,
                movimentacoes: almoxRes.data.movimentacoes.length,
                fornecedores: almoxRes.data.fornecedores.length
            }
        }

        kpis.innerHTML = [
            kpi('fa-users', totalUsuarios, 'Usuários cadastrados', `${totalAlunos} alunos · ${totalProfessores} professores`),
            kpi('fa-user-graduate', totalAlunos, 'Alunos', 'Base total da plataforma'),
            kpi('fa-user-clock', pendentes, 'Aprovações pendentes', pendentes > 0 ? 'Requer atenção' : 'Em dia', pendentes > 0 ? 'kpi-warn' : 'kpi-ok'),
            kpi('fa-file-pdf', provasPendentes, 'Provas para corrigir', `${provasResumo.total} avaliações registradas`, provasPendentes > 0 ? 'kpi-warn' : 'kpi-ok'),
            kpi('fa-circle-check', aulasConcluidas, 'Aulas concluídas', 'Progresso acumulado dos alunos'),
            kpi('fa-award', certEmitidos, 'Certificados ativos', certRevogados > 0 ? `${certRevogados} revogado(s)` : 'Nenhum revogado'),
            kpi('fa-comments', forumTotal, 'Mensagens no fórum', 'Comunidade e dúvidas'),
            kpi('fa-boxes-stacked', almox ? almox.totalItens : '—', 'Itens no almoxarifado', almox ? `${almox.semEstoque} sem estoque · ${almox.estoqueBaixo} com estoque baixo` : 'Módulo não configurado', 'kpi-gold')
        ].join('')

        montarAlertas(alertas, {
            pendentes,
            provasPendentes,
            almox,
            almoxErro: almoxRes.error,
            certsResErro: certsRes.error
        })

        destroyChartsAdmin()
        drawAdminProgress('chartCentralProgresso', ranking)
        drawAdminRoles('chartCentralRoles', usuarios)
        drawMatriculasEvolucao('chartCentralMatriculas', usuarios, 12)
        drawDonut(
            'chartCentralCerts',
            ['Emitidos', 'Revogados'],
            [certEmitidos, certRevogados],
            ['rgba(46,125,50,0.8)', 'rgba(198,40,40,0.75)'],
            'admCerts',
            'certificado(s)'
        )

        renderResumo(resumo, {
            usuarios,
            certificados,
            provasResumo,
            forumTotal,
            salasAtivas,
            almox,
            almoxMov: almoxRes.data?.movimentacoes || []
        })
    } catch (error) {
        console.error('Erro na Central Administrativa:', error)
        if (kpis) {
            kpis.innerHTML = `<div class="empty" style="grid-column:1/-1"><i class="fas fa-triangle-exclamation"></i><h4>Não foi possível carregar os indicadores</h4><p>${sanitizar(error.message || 'Tente novamente.')}</p></div>`
        }
        if (resumo) {
            resumo.innerHTML = '<div class="empty" style="padding:24px"><p>Dados indisponíveis no momento.</p></div>'
        }
        handleError(error)
    }
}

function montarAlertas(container, dados) {
    if (!container) return

    const itens = []

    if (dados.pendentes > 0) {
        itens.push({
            tipo: 'warn',
            icone: 'fa-user-clock',
            titulo: `${dados.pendentes} aprovação(ões) pendente(s)`,
            texto: 'Há alunos aguardando liberação de acesso.',
            acao: 'Aprovar agora',
            destino: 'pendentes'
        })
    }

    if (dados.provasPendentes > 0) {
        itens.push({
            tipo: 'warn',
            icone: 'fa-file-signature',
            titulo: `${dados.provasPendentes} prova(s) para corrigir`,
            texto: 'Avaliações aguardando correção e lançamento de nota.',
            acao: 'Ir para correções',
            destino: 'provas'
        })
    }

    if (dados.almox) {
        if (dados.almox.lotesVencidos > 0) {
            itens.push({
                tipo: 'danger',
                icone: 'fa-calendar-xmark',
                titulo: `${dados.almox.lotesVencidos} lote(s) vencido(s)`,
                texto: 'Lotes vencidos não podem ser usados em saídas normais.',
                acao: 'Ver validade',
                destino: 'almoxarifado'
            })
        }
        if (dados.almox.semEstoque > 0) {
            itens.push({
                tipo: 'danger',
                icone: 'fa-box-open',
                titulo: `${dados.almox.semEstoque} item(ns) sem estoque`,
                texto: 'Reposição necessária para manter a operação.',
                acao: 'Abrir almoxarifado',
                destino: 'almoxarifado'
            })
        }
        if (dados.almox.estoqueBaixo > 0) {
            itens.push({
                tipo: 'info',
                icone: 'fa-arrow-trend-down',
                titulo: `${dados.almox.estoqueBaixo} item(ns) com estoque baixo`,
                texto: 'Saldo igual ou abaixo do estoque mínimo definido.',
                acao: 'Conferir estoque',
                destino: 'almoxarifado'
            })
        }
    }

    if (itens.length === 0) {
        container.innerHTML = `
            <div class="alm-alert alm-alert-ok">
                <i class="fas fa-circle-check"></i>
                <div><strong>Nenhuma pendência crítica no momento</strong><span>Indicadores operacionais dentro do esperado.</span></div>
            </div>
        `
        return
    }

    container.innerHTML = itens.map(item => `
        <div class="alm-alert alm-alert-${item.tipo}">
            <i class="fas ${item.icone}"></i>
            <div>
                <strong>${sanitizar(item.titulo)}</strong>
                <span>${sanitizar(item.texto)}</span>
            </div>
            <button type="button" class="btn btn-sm btn-s" onclick="window.nav('${item.destino}')">${item.acao}</button>
        </div>
    `).join('')
}

function renderResumo(container, dados) {
    if (!container) return

    const recentes = [...(dados.usuarios || [])]
        .filter(u => u.criado_em || u.created_at)
        .sort((a, b) => new Date(b.criado_em || b.created_at) - new Date(a.criado_em || a.created_at))
        .slice(0, 5)

    const classes = { aluno: 'bg-info', professor: 'bg-ok', admin: 'bg-warn', super_admin: 'bg-warn' }

    let h = `
        <div class="adm-resumo-grid">
            <div class="adm-resumo-item"><span>Fórum</span><strong>${dados.forumTotal}</strong><small>mensagens</small></div>
            <div class="adm-resumo-item"><span>Salas ativas</span><strong>${dados.salasAtivas}</strong><small>ao vivo</small></div>
            <div class="adm-resumo-item"><span>Avaliações</span><strong>${dados.provasResumo.total}</strong><small>${dados.provasResumo.corrigido} corrigidas</small></div>
            <div class="adm-resumo-item"><span>Certificados</span><strong>${dados.certificados.length}</strong><small>${dados.certificados.filter(c => c.revogado === true).length} revogados</small></div>
        </div>
        <h4 class="adm-subtitle">Últimos cadastros</h4>
    `

    if (recentes.length === 0) {
        h += '<p style="font-size:13px;color:var(--tx3)">Nenhum cadastro recente encontrado.</p>'
    } else {
        h += `<div class="tw"><table><thead><tr><th>Nome</th><th>Perfil</th><th>Status</th><th>Cadastro</th></tr></thead><tbody>`
        recentes.forEach(u => {
            h += `<tr>
                <td><strong>${sanitizar(u.nome_completo || 'Usuário')}</strong><br><span style="font-size:11px;color:var(--tx3)">${sanitizar(u.email || '')}</span></td>
                <td><span class="badge ${classes[u.role] || 'bg-info'}">${sanitizar(u.role || 'aluno')}</span></td>
                <td><span class="badge ${u.status === 'ativo' ? 'bg-ok' : u.status === 'pendente' ? 'bg-pendente' : 'bg-err'}">${sanitizar(u.status || 'pendente')}</span></td>
                <td>${fmtD(u.criado_em || u.created_at)}</td>
            </tr>`
        })
        h += '</tbody></table></div>'
    }

    if (dados.almox && dados.almoxMov.length > 0) {
        h += `<h4 class="adm-subtitle">Movimentações recentes do almoxarifado</h4>`
        h += `<div class="tw"><table><thead><tr><th>Tipo</th><th>Item</th><th>Qtd.</th><th>Data</th></tr></thead><tbody>`
        dados.almoxMov.slice(0, 5).forEach(m => {
            h += `<tr>
                <td>${sanitizar(m.tipo)}</td>
                <td>${sanitizar(m.item?.nome || 'Item')}</td>
                <td>${Number(m.quantidade || 0).toLocaleString('pt-BR')} ${sanitizar(m.item?.unidade_medida || '')}</td>
                <td>${fmtD(m.data_hora)}</td>
            </tr>`
        })
        h += '</tbody></table></div>'
    }

    container.innerHTML = h
}

window.centralAtualizar = function () {
    toast('Atualizando indicadores...', 'info')
    carregarCentral()
}
