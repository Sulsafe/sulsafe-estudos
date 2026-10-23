// ============================================================
// VIEW: MEUS CURSOS / TRILHAS (conteúdo direcionado)
// ============================================================
import { uid, fmtD, nav } from '../state.js'
import { sbGetMinhasTurmas, sbGetConteudosMinhasTurmas } from '../supabase-client.js'
import { openMdl, closeMdl, toast, sanitizar } from '../utils.js'

const TIPOS = {
    turma: { label: 'Turma', icon: 'fa-users' },
    individual: { label: 'Individual', icon: 'fa-user' },
    atualizacao: { label: 'Atualização', icon: 'fa-rotate' }
}

let trilhasCache = []

export function vTrilhas() {
    if (!uid()) return nav('inicio')

    let h = `<div class="btn-back" onclick="window.nav('inicio')"><i class="fas fa-arrow-left"></i> Voltar</div>`
    h += `
        <div class="god-hd">
            <h2><i class="fas fa-route"></i> Meus Cursos / Trilhas</h2>
            <p>Conteúdos e avaliações direcionados para você pelos professores.</p>
        </div>
        <div id="trilhasGrid">
            <div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando suas trilhas...</p></div>
        </div>
    `

    setTimeout(carregarMinhasTrilhas, 100)
    return h
}

function normalizarRelacao(valor) {
    return Array.isArray(valor) ? valor[0] : valor
}

async function carregarMinhasTrilhas() {
    const grid = document.getElementById('trilhasGrid')
    if (!grid) return

    const { data: vinculos, error: erroVinculos } = await sbGetMinhasTurmas(uid())

    if (erroVinculos) {
        console.error('Erro ao carregar trilhas:', erroVinculos)
        grid.innerHTML = `
            <div class="empty">
                <i class="fas fa-triangle-exclamation"></i>
                <h4>Não foi possível carregar suas trilhas</h4>
                <p>${sanitizar(erroVinculos.message || 'Verifique sua conexão e tente novamente.')}</p>
            </div>
        `
        return
    }

    trilhasCache = (vinculos || [])
        .map(v => ({
            turma: normalizarRelacao(v.turmas),
            data_entrada: v.data_entrada
        }))
        .filter(item => item.turma?.id)

    if (trilhasCache.length === 0) {
        grid.innerHTML = `
            <div class="empty">
                <i class="fas fa-route"></i>
                <h4>Nenhuma trilha direcionada ainda</h4>
                <p>Quando um professor inscrever você em uma turma ou trilha, o conteúdo aparecerá aqui.</p>
            </div>
        `
        return
    }

    const ids = trilhasCache.map(item => item.turma.id)
    const { data: links, error: erroLinks } = await sbGetConteudosMinhasTurmas(ids)

    if (erroLinks) {
        console.error('Erro ao carregar conteúdos das trilhas:', erroLinks)
    }

    const conteudosPorTurma = new Map()

    for (const link of links || []) {
        const turmaId = link.turma_id
        if (!conteudosPorTurma.has(turmaId)) conteudosPorTurma.set(turmaId, [])

        const material = normalizarRelacao(link.materiais)
        const videoaula = normalizarRelacao(link.videoaulas)

        if (material?.id) {
            conteudosPorTurma.get(turmaId).push({
                tipo: 'material',
                id: material.id,
                titulo: material.titulo || 'Material',
                descricao: material.descricao || '',
                url: material.url || material.arquivo_url || '',
                nr_id: material.nr_id
            })
        }

        if (videoaula?.id) {
            conteudosPorTurma.get(turmaId).push({
                tipo: 'videoaula',
                id: videoaula.id,
                titulo: videoaula.titulo || 'Videoaula',
                descricao: videoaula.descricao || '',
                url: videoaula.url_video || videoaula.link_youtube || '',
                nr_id: videoaula.nr_id
            })
        }
    }

    trilhasCache.forEach(item => {
        item.conteudos = conteudosPorTurma.get(item.turma.id) || []
    })

    grid.innerHTML = `<div class="grid-nrs">${trilhasCache.map(({ turma, data_entrada }) => {
        const conteudos = conteudosPorTurma.get(turma.id) || []
        const tipo = TIPOS[turma.tipo] || TIPOS.turma
        const videos = conteudos.filter(c => c.tipo === 'videoaula').length
        const materiais = conteudos.filter(c => c.tipo === 'material').length

        return `
            <div class="card-nr">
                <div class="card-nr-hd">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px">
                        <span class="badge bg-info"><i class="fas ${tipo.icon}"></i> ${tipo.label}</span>
                        <span class="badge" style="background:var(--bd);color:var(--tx2)">${conteudos.length} conteúdos</span>
                    </div>
                    <h4>${sanitizar(turma.nome)}</h4>
                    ${turma.descricao ? `<p style="font-size:12px;color:var(--tx3);margin:6px 0 0">${sanitizar(turma.descricao)}</p>` : ''}
                </div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--tx3);margin-bottom:10px">
                    <span><i class="fas fa-circle-play"></i> ${videos} vídeo(s)</span>
                    <span><i class="fas fa-file-pdf"></i> ${materiais} material(is)</span>
                </div>
                <div style="font-size:11px;color:var(--tx3);margin-bottom:10px">Inscrito em ${fmtD(data_entrada)}</div>
                <button class="btn btn-p btn-block" data-id="${sanitizar(turma.id)}" onclick="window.abrirMinhaTrilha(this.dataset.id)">
                    <i class="fas fa-folder-open"></i> Ver Conteúdos
                </button>
            </div>
        `
    }).join('')}</div>`
}

function abrirMinhaTrilha(turmaId) {
    const item = trilhasCache.find(t => String(t.turma.id) === String(turmaId))
    if (!item) {
        toast('Trilha não encontrada.', 'err')
        return
    }

    const { turma } = item
    const conteudos = item.conteudos || []
    const tipo = TIPOS[turma.tipo] || TIPOS.turma
    const videos = conteudos.filter(c => c.tipo === 'videoaula')
    const materiais = conteudos.filter(c => c.tipo === 'material')

    const renderItem = (conteudo) => {
        const botao = conteudo.tipo === 'videoaula'
            ? `<button class="btn btn-sm btn-p" data-link="${sanitizar(conteudo.url)}" data-title="${sanitizar(conteudo.titulo)}" data-nr="${sanitizar(String(conteudo.nr_id || 0))}" onclick="window.abrirVideoTrilha(this.dataset.link, this.dataset.title, this.dataset.nr)">
                    <i class="fas fa-play"></i> Assistir
               </button>`
            : `<button class="btn btn-sm btn-p" data-url="${sanitizar(conteudo.url)}" onclick="window.estudarMaterial(this.dataset.url)">
                    <i class="fas fa-book-open"></i> Estudar
               </button>`

        return `
            <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--ip);border:1px solid var(--bd);border-radius:8px;margin-bottom:8px;flex-wrap:wrap">
                <i class="fas ${conteudo.tipo === 'videoaula' ? 'fa-circle-play' : 'fa-file-pdf'}" style="color:var(--p)"></i>
                <div style="flex:1;min-width:160px">
                    <div style="font-size:13px;font-weight:600">${sanitizar(conteudo.titulo)}</div>
                    ${conteudo.descricao ? `<div style="font-size:11px;color:var(--tx3);margin-top:2px">${sanitizar(conteudo.descricao)}</div>` : ''}
                    ${conteudo.nr_id ? `<div style="font-size:11px;color:var(--tx3);margin-top:2px">NR ${sanitizar(String(conteudo.nr_id))}</div>` : ''}
                </div>
                ${conteudo.url ? botao : '<span class="badge" style="background:var(--bd);color:var(--tx3)">Sem arquivo</span>'}
            </div>
        `
    }

    openMdl(`
        <button class="mdl-x" onclick="window.closeMdl()"><i class="fas fa-times"></i></button>
        <div style="margin-bottom:16px">
            <span class="badge bg-info"><i class="fas ${tipo.icon}"></i> ${tipo.label}</span>
            <h2 style="font-size:20px;font-weight:800;margin:8px 0 4px">${sanitizar(turma.nome)}</h2>
            ${turma.descricao ? `<p style="font-size:13px;color:var(--tx3)">${sanitizar(turma.descricao)}</p>` : ''}
        </div>
        ${videos.length ? `<h3 style="font-size:14px;font-weight:700;margin:16px 0 8px"><i class="fas fa-circle-play"></i> Videoaulas</h3>${videos.map(renderItem).join('')}` : ''}
        ${materiais.length ? `<h3 style="font-size:14px;font-weight:700;margin:16px 0 8px"><i class="fas fa-file-pdf"></i> Materiais</h3>${materiais.map(renderItem).join('')}` : ''}
        ${!videos.length && !materiais.length ? `<div class="empty"><i class="fas fa-folder-open"></i><p>O professor ainda não vinculou conteúdos a esta trilha.</p></div>` : ''}
    `)
}

function abrirVideoTrilha(link, titulo, nr) {
    if (!link) {
        toast('Videoaula sem link válido.', 'err')
        return
    }

    closeMdl()
    if (typeof window.abrirPlayerNr === 'function') {
        window.abrirPlayerNr(Number(nr) || 0, encodeURIComponent(link), encodeURIComponent(titulo || 'Videoaula'))
    } else {
        window.open(link, '_blank', 'noopener,noreferrer')
    }
}

window.abrirMinhaTrilha = abrirMinhaTrilha
window.abrirVideoTrilha = abrirVideoTrilha
