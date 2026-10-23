// ============================================================
// GRÁFICOS ADMINISTRATIVOS COMPARTILHADOS
// Reutilizados pelo Modo Deus e pela Central Administrativa.
// ============================================================

const CORES = {
    verde: 'rgba(46,125,50,0.75)',
    verdeClaro: 'rgba(67,160,71,0.75)',
    verdeEscuro: 'rgba(27,94,32,0.85)',
    dourado: 'rgba(201,176,55,0.8)',
    vermelho: 'rgba(198,40,40,0.75)',
    laranja: 'rgba(230,81,0,0.75)',
    azul: 'rgba(21,101,192,0.75)',
    cinza: 'rgba(120,130,125,0.55)'
}

function cssVar(nome, fallback) {
    try {
        const valor = getComputedStyle(document.documentElement).getPropertyValue(nome).trim()
        return valor || fallback
    } catch (e) {
        return fallback
    }
}

function eixo(tema) {
    return {
        ticks: { color: cssVar('--tx3', 'rgba(100,100,100,0.8)'), font: { size: 11 } },
        grid: { color: tema === 'escuro' ? 'rgba(255,255,255,0.08)' : 'rgba(200,210,205,0.35)' }
    }
}

function temaAtual() {
    return document.body.classList.contains('t-escuro') ? 'escuro' : 'claro'
}

function textoLegenda() {
    return cssVar('--tx2', '#4a4a4a')
}

function obterCanvas(alvo) {
    if (!alvo) return null
    return typeof alvo === 'string' ? document.getElementById(alvo) : alvo
}

function registrar(chave, canvas, config) {
    if (typeof Chart === 'undefined' || !canvas) return null

    window.charts = window.charts || {}
    const anterior = window.charts[chave]
    if (anterior) {
        try { anterior.destroy() } catch (e) { /* noop */ }
    }

    try {
        const grafico = new Chart(canvas, config)
        window.charts[chave] = grafico
        return grafico
    } catch (erro) {
        console.warn('Erro ao desenhar gráfico', chave, erro)
        return null
    }
}

function opcoesBase(extras = {}) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 350 },
        plugins: {
            legend: {
                labels: { color: textoLegenda(), boxWidth: 12, font: { size: 11 } }
            },
            tooltip: {
                backgroundColor: 'rgba(15,26,18,0.94)',
                padding: 10,
                cornerRadius: 8
            }
        },
        ...extras
    }
}

export function drawAdminProgress(alvo, ranking) {
    const canvas = obterCanvas(alvo)
    if (!canvas) return null

    let p0 = 0, p1 = 0, p2 = 0, p3 = 0
    ;(ranking || []).forEach(a => {
        const pct = Number(a.progresso) || 0
        if (pct === 0) p0++
        else if (pct <= 50) p1++
        else if (pct <= 80) p2++
        else p3++
    })

    return registrar('admProg', canvas, {
        type: 'bar',
        data: {
            labels: ['Não iniciado', '1-50%', '51-80%', '81-100%'],
            datasets: [{
                label: 'Alunos',
                data: [p0, p1, p2, p3],
                backgroundColor: [CORES.vermelho, CORES.laranja, CORES.verdeClaro, CORES.verdeEscuro],
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: opcoesBase({
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15,26,18,0.94)',
                    callbacks: { label: ctx => `${ctx.parsed.y} aluno(s)` }
                }
            },
            scales: {
                y: { beginAtZero: true, ...eixo(temaAtual()), ticks: { stepSize: 1, color: cssVar('--tx3', '#888') } },
                x: { ticks: { color: cssVar('--tx2', '#4a4a4a'), font: { size: 11 } }, grid: { display: false } }
            }
        })
    })
}

export function drawAdminRoles(alvo, users) {
    const canvas = obterCanvas(alvo)
    if (!canvas) return null

    const rc = { admin: 0, professor: 0, aluno: 0 }
    ;(users || []).forEach(u => {
        const chave = u.role === 'super_admin' ? 'admin' : u.role
        rc[chave] = (rc[chave] || 0) + 1
    })

    return registrar('admRoles', canvas, {
        type: 'bar',
        data: {
            labels: ['Admins', 'Professores', 'Alunos'],
            datasets: [{
                label: 'Usuários',
                data: [rc.admin, rc.professor, rc.aluno],
                backgroundColor: [CORES.dourado, CORES.verde, CORES.azul],
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: opcoesBase({
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15,26,18,0.94)',
                    callbacks: { label: ctx => `${ctx.parsed.x} usuário(s)` }
                }
            },
            scales: {
                x: { beginAtZero: true, ...eixo(temaAtual()), ticks: { stepSize: 1, color: cssVar('--tx3', '#888') } },
                y: { ticks: { color: cssVar('--tx2', '#4a4a4a'), font: { weight: '600', size: 11 } }, grid: { display: false } }
            }
        })
    })
}

function dataValida(valor) {
    if (!valor) return null
    const d = new Date(valor)
    return Number.isNaN(d.getTime()) ? null : d
}

export function drawMatriculasEvolucao(alvo, profiles, meses = 12) {
    const canvas = obterCanvas(alvo)
    if (!canvas) return null

    const totalMeses = Math.max(1, Number(meses) || 12)
    const agora = new Date()
    const pontos = []

    for (let i = totalMeses - 1; i >= 0; i--) {
        const ref = new Date(agora.getFullYear(), agora.getMonth() - i, 1)
        pontos.push({
            chave: `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`,
            label: ref.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
            fim: new Date(ref.getFullYear(), ref.getMonth() + 1, 1),
            total: 0
        })
    }

    const datas = (profiles || [])
        .map(p => dataValida(p.criado_em || p.created_at))
        .filter(Boolean)
        .sort((a, b) => a - b)

    // Matrículas acumuladas: para cada mês exibido, conta perfis criados até o fim dele.
    pontos.forEach(ponto => {
        ponto.total = datas.filter(d => d < ponto.fim).length
    })

    // Se todos os pontos forem zero, ainda há evolução a partir do total atual
    // quando o perfil não possui data confiável.
    const temDados = datas.length > 0

    return registrar('admMatriculas', canvas, {
        type: 'line',
        data: {
            labels: pontos.map(p => p.label),
            datasets: [{
                label: 'Matrículas acumuladas',
                data: pontos.map(p => p.total),
                borderColor: CORES.verdeEscuro,
                backgroundColor: 'rgba(46,125,50,0.12)',
                fill: true,
                tension: 0.35,
                pointRadius: temDados ? 3 : 0,
                pointBackgroundColor: CORES.verde
            }]
        },
        options: opcoesBase({
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15,26,18,0.94)',
                    callbacks: { label: ctx => `${ctx.parsed.y} cadastro(s) acumulado(s)` }
                }
            },
            scales: {
                y: { beginAtZero: true, ...eixo(temaAtual()), ticks: { precision: 0, color: cssVar('--tx3', '#888') } },
                x: { ticks: { color: cssVar('--tx2', '#4a4a4a'), font: { size: 10 } }, grid: { display: false } }
            }
        })
    })
}

export function drawDonut(alvo, labels, valores, cores, chave = 'admDonut', rotulo = 'Total') {
    const canvas = obterCanvas(alvo)
    if (!canvas) return null

    return registrar(chave, canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: valores,
                backgroundColor: cores,
                borderWidth: 2,
                borderColor: cssVar('--card-bg', '#fff')
            }]
        },
        options: opcoesBase({
            cutout: '62%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: textoLegenda(), boxWidth: 12, padding: 12, font: { size: 11 } }
                },
                tooltip: {
                    backgroundColor: 'rgba(15,26,18,0.94)',
                    callbacks: { label: ctx => `${ctx.label}: ${ctx.parsed} ${rotulo}` }
                }
            }
        })
    })
}

export function drawMovimentacoesPorDia(alvo, serie) {
    const canvas = obterCanvas(alvo)
    if (!canvas) return null

    const lista = serie || []
    const labels = lista.map(p => {
        const [a, m, d] = p.data.split('-')
        return `${d}/${m}`
    })

    return registrar('almoxMovDia', canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Entradas',
                    data: lista.map(p => p.entradas),
                    backgroundColor: CORES.verde,
                    borderRadius: 5,
                    stack: 'mov'
                },
                {
                    label: 'Saídas',
                    data: lista.map(p => p.saidas),
                    backgroundColor: CORES.laranja,
                    borderRadius: 5,
                    stack: 'mov'
                }
            ]
        },
        options: opcoesBase({
            plugins: {
                legend: { labels: { color: textoLegenda(), boxWidth: 12, font: { size: 11 } } },
                tooltip: {
                    backgroundColor: 'rgba(15,26,18,0.94)',
                    callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y} movimentação(ões)` }
                }
            },
            scales: {
                y: { beginAtZero: true, ...eixo(temaAtual()), ticks: { precision: 0, color: cssVar('--tx3', '#888') } },
                x: { stacked: true, ticks: { color: cssVar('--tx2', '#4a4a4a'), font: { size: 9 } }, grid: { display: false } }
            }
        })
    })
}

export function drawItensPorCategoria(alvo, grupos) {
    const canvas = obterCanvas(alvo)
    if (!canvas) return null

    const lista = grupos || []
    const paleta = [CORES.verde, CORES.verdeClaro, CORES.dourado, CORES.azul, CORES.laranja, CORES.cinza]

    return registrar('almoxCategorias', canvas, {
        type: 'bar',
        data: {
            labels: lista.map(g => g.categoria),
            datasets: [{
                label: 'Itens cadastrados',
                data: lista.map(g => g.total),
                backgroundColor: lista.map((_, i) => paleta[i % paleta.length]),
                borderRadius: 6
            }]
        },
        options: opcoesBase({
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15,26,18,0.94)',
                    callbacks: { label: ctx => `${ctx.parsed.x} item(ns)` }
                }
            },
            scales: {
                x: { beginAtZero: true, ...eixo(temaAtual()), ticks: { precision: 0, color: cssVar('--tx3', '#888') } },
                y: { ticks: { color: cssVar('--tx2', '#4a4a4a'), font: { size: 11 } }, grid: { display: false } }
            }
        })
    })
}

export function destroyChartsAdmin() {
    if (!window.charts) return
    Object.keys(window.charts).forEach(chave => {
        if (!chave.startsWith('adm') && !chave.startsWith('almox')) return
        try { window.charts[chave]?.destroy() } catch (e) { /* noop */ }
        delete window.charts[chave]
    })
}

window.SulSafeCharts = {
    drawAdminProgress,
    drawAdminRoles,
    drawMatriculasEvolucao,
    drawDonut,
    drawMovimentacoesPorDia,
    drawItensPorCategoria,
    destroyChartsAdmin
}
