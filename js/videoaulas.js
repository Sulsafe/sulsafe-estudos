// ============================================================
// VIEW: VIDEOAULAS (Estudo por NR e Player Integrado)
// ============================================================

import { S, NRS, role, isAdmin, isProf, uid, nav } from './state.js'
import { sb, sbGetVideoaulas, sbGetProgressoUsuario } from './supabase-client.js'
import { toast, sanitizar, $, $$ } from './utils.js'

// Estado interno da view de videoaulas
let videoaulasData = []
let progressoMap = {}
let videoAulaAtiva = null

export function vVideoaulas() {
    const r = role()
    const canEdit = isAdmin() || isProf()

    let h = `
        <div class="btn-back" onclick="window.nav('inicio')">
            <i class="fas fa-arrow-left"></i> Voltar ao Início
        </div>

        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;margin-bottom:20px">
            <div>
                <h2 class="wc"><i class="fas fa-circle-play" style="color:var(--p);margin-right:8px"></i>Videoaulas das NRs</h2>
                <p class="wcs">${canEdit ? 'Gerencie os links e aulas oficiais de cada Norma Regulamentadora.' : 'Estude as 38 Normas Regulamentadoras com foco prático e objetivo.'}</p>
            </div>
            <div id="progressoResumoVa" style="background:var(--card-bg);padding:12px 18px;border-radius:var(--r);box-shadow:var(--shadow);border:1px solid var(--bd);display:flex;align-items:center;gap:14px">
                <i class="fas fa-graduation-cap" style="font-size:24px;color:var(--p)"></i>
                <div>
                    <div style="font-size:11px;font-weight:700;color:var(--tx3);text-transform:uppercase">Seu Progresso</div>
                    <div id="progressoTxtVa" style="font-size:15px;font-weight:800;color:var(--p)">Calculando...</div>
                </div>
            </div>
        </div>

        <div style="display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap;align-items:center">
            <input class="search" id="buscaVideoaulas" placeholder="Buscar por número ou nome da NR (ex: Trabalho em Altura, NR 10)..." style="flex:2;min-width:240px;margin:0" oninput="filtrarVideoaulas()">
            <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="btn btn-sm" style="width: auto; flex: none; btn-p filtro-va-btn on" data-filtro="all" onclick="filtrarCategoriaVa('all', this)">Todas (38)</button>
                <button class="btn btn-sm" style="width: auto; flex: none; btn-s filtro-va-btn" data-filtro="gerais" onclick="filtrarCategoriaVa('gerais', this)">Gerais</button>
                <button class="btn btn-sm" style="width: auto; flex: none; btn-s filtro-va-btn" data-filtro="especificas" onclick="filtrarCategoriaVa('especificas', this)">Específicas</button>
                <button class="btn btn-sm" style="width: auto; flex: none; btn-s filtro-va-btn" data-filtro="setoriais" onclick="filtrarCategoriaVa('setoriais', this)">Setoriais</button>
                <button class="btn btn-sm" style="width: auto; flex: none; btn-s filtro-va-btn" data-filtro="concluidas" onclick="filtrarCategoriaVa('concluidas', this)">Concluídas</button>
            </div>
        </div>

        <div id="videoaulasGrid">
            <div class="empty">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Carregando videoaulas e progresso acadêmico...</p>
            </div>
        </div>
    `

    setTimeout(carregarVideoaulasData, 100)
    return h
}

async function carregarVideoaulasData() {
    const grid = document.getElementById('videoaulasGrid')
    if (!grid) return

    try {
        // 1. Busca apenas os vídeos globais (conteúdo direcionado fica nas trilhas)
        const { data: videos, error: errVideos } = await sbGetVideoaulas(null, true)

        if (errVideos) {
            console.warn('Aviso ao buscar videoaulas:', errVideos)
        }
        videoaulasData = videos || []

        // 2. Busca progresso do aluno logado
        progressoMap = {}
        const userId = uid()
        if (userId) {
            const { data: progressos } = await sbGetProgressoUsuario(userId)
            if (progressos && Array.isArray(progressos)) {
                progressos.forEach(p => {
                    const nrKey = p.nr || p.aula_id || p.nr_id
                    if (nrKey && (p.concluído === true || p.concluido === true)) {
                        progressoMap[String(nrKey)] = true
                    }
                })
            }
        }

        renderGridVideoaulas()
    } catch (err) {
        console.error('Erro ao carregar videoaulas:', err)
        renderGridVideoaulas()
    }
}

function renderGridVideoaulas() {
    const grid = document.getElementById('videoaulasGrid')
    if (!grid) return

    const canEdit = isAdmin() || isProf()
    let concluidasCount = 0

    NRS.forEach(nr => {
        if (progressoMap[String(nr.n)]) concluidasCount++
    })

    const progressoTxt = document.getElementById('progressoTxtVa')
    if (progressoTxt) {
        const pct = Math.round((concluidasCount / NRS.length) * 100)
        progressoTxt.innerHTML = `${concluidasCount} de ${NRS.length} NRs (${pct}%)`
    }

    let h = `<div class="grid-nrs">`

    NRS.forEach(nr => {
        const video = videoaulasData.find(v => v.nr === nr.n || v.nr_id === nr.n)
        const link = video?.url_video || video?.link_youtube || ''
        const concluida = Boolean(progressoMap[String(nr.n)])

        h += `
            <div class="card-nr" data-nr="${nr.n}" data-cat="${nr.cat}" data-concluida="${concluida}" data-search="nr ${nr.n} ${nr.nome.toLowerCase()}">
                <div class="card-nr-hd">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                        <div class="nr-badge">
                            <span>NR ${nr.n}</span>
                        </div>
                        ${concluida ? `
                            <span class="badge bg-ok" title="Aula concluída"><i class="fas fa-check-circle"></i> Concluída</span>
                        ` : link ? `
                            <span class="badge bg-info"><i class="fas fa-play"></i> Disponível</span>
                        ` : `
                            <span class="badge" style="background:var(--bd);color:var(--tx3)"><i class="fas fa-clock"></i> Em breve</span>
                        `}
                    </div>
                    <h4>${nr.nome}</h4>
                    <span style="font-size:11px;color:var(--tx3);text-transform:capitalize">${nr.cat}</span>
                </div>

                ${canEdit ? `
                    <div class="admin-area" style="background:var(--ip);padding:8px;border-radius:6px;margin:8px 0">
                        <label><i class="fas fa-link"></i> Link YouTube / Embed</label>
                        <input type="text" class="input-link-nr" placeholder="https://youtube.com/embed/..." value="${sanitizar(link)}">
                        <button class="btn btn-sm btn-p btn-block" style="width:auto;flex:none;" onclick="salvarLinkNr(${nr.n}, this)">
                            <i class="fas fa-save"></i> ${link ? 'Atualizar Link' : 'Salvar Link'}
                        </button>
                    </div>
                ` : ''}

                <div class="aluno-area">
                    ${link ? `
                        <button class="btn btn-p btn-block" onclick="abrirPlayerNr(${nr.n}, '${encodeURIComponent(link)}', '${encodeURIComponent(nr.nome)}')">
                            <i class="fas fa-circle-play"></i> Assistir Aula
                        </button>
                    ` : `
                        <div class="sem-video">
                            <i class="fas fa-circle-info"></i>
                            <span>Aula sendo produzida</span>
                        </div>
                    `}
                </div>
            </div>
        `
    })

    h += `</div>`
    grid.innerHTML = h
}

// Filtros em tempo real
function filtrarVideoaulas() {
    const q = ($('#buscaVideoaulas')?.value || '').toLowerCase().trim()
    const filtroAtivo = document.querySelector('.filtro-va-btn.on')?.dataset?.filtro || 'all'

    $$('#videoaulasGrid .card-nr').forEach(card => {
        const matchBusca = !q || (card.dataset.search || '').includes(q)
        let matchFiltro = true

        if (filtroAtivo === 'gerais' || filtroAtivo === 'especificas' || filtroAtivo === 'setoriais') {
            matchFiltro = card.dataset.cat === filtroAtivo
        } else if (filtroAtivo === 'concluidas') {
            matchFiltro = card.dataset.concluida === 'true'
        }

        card.style.display = matchBusca && matchFiltro ? '' : 'none'
    })
}

function filtrarCategoriaVa(cat, btn) {
    $$('.filtro-va-btn').forEach(b => {
        b.classList.remove('on')
        b.classList.remove('btn-p')
        b.classList.add('btn-s')
    })
    btn.classList.add('on')
    btn.classList.add('btn-p')
    btn.classList.remove('btn-s')
    filtrarVideoaulas()
}

// Player de vídeo e modais
function abrirPlayerNr(num, encLink, encNome) {
    const link = decodeURIComponent(encLink)
    const nome = decodeURIComponent(encNome)
    videoAulaAtiva = { nr: num, nome, link }

    let embedLink = link
    if (link.includes('watch?v=')) {
        embedLink = link.replace('watch?v=', 'embed/')
    } else if (link.includes('youtu.be/')) {
        embedLink = link.replace('youtu.be/', 'youtube.com/embed/')
    }

    const modal = document.getElementById('videoModal')
    const iframe = document.getElementById('videoIframe')
    const title = document.getElementById('videoModalTitle')
    const info = document.getElementById('videoModalInfo')
    const btnConcluir = document.getElementById('btnConcluirAula')

    if (modal && iframe && title) {
        title.innerHTML = `<i class="fas fa-play-circle" style="color:var(--p);margin-right:6px"></i> NR ${num} — ${nome}`
        if (info) {
            const concluida = Boolean(progressoMap[String(num)])
            info.innerHTML = concluida ? '<span style="color:#4caf50"><i class="fas fa-check"></i> Você já concluiu esta aula</span>' : 'Assista com atenção para registrar seu aprendizado.'
        }
        if (btnConcluir) {
            btnConcluir.style.display = 'inline-flex'
            btnConcluir.innerHTML = progressoMap[String(num)] ? '<i class="fas fa-check-double"></i> Concluída (Atualizar)' : '<i class="fas fa-check"></i> Marcar como Concluída'
        }
        iframe.src = embedLink + (embedLink.includes('?') ? '&autoplay=1' : '?autoplay=1')
        modal.classList.add('on')
    } else {
        // Fallback para nova janela caso modal não esteja no DOM
        window.open(embedLink, '_blank')
    }
}

function fecharModalVideo() {
    const modal = document.getElementById('videoModal')
    const iframe = document.getElementById('videoIframe')
    if (iframe) iframe.src = ''
    if (modal) modal.classList.remove('on')
    videoAulaAtiva = null
}

async function concluirAulaAtual() {
    if (!videoAulaAtiva) return
    const userId = uid()
    if (!userId) {
        toast('Faça login para salvar seu progresso.', 'warn')
        return
    }

    const nrNum = videoAulaAtiva.nr

    try {
        const { error } = await sb.from('progresso_aulas').upsert({
            user_id: userId,
            aula_id: String(nrNum),
            assistiu_segundos: 600,
            concluído: true,
            ultima_atualizacao: new Date().toISOString()
        })

        if (error) throw error

        progressoMap[String(nrNum)] = true
        toast(`Parabéns! NR ${nrNum} marcada como concluída!`, 'success')
        fecharModalVideo()
        renderGridVideoaulas()
    } catch (err) {
        console.error('Erro ao salvar progresso:', err)
        toast('Não foi possível registrar conclusão: ' + (err.message || 'Erro de conexão'), 'err')
    }
}

async function salvarLinkNr(nrNum, btn) {
    const card = btn.closest('.card-nr')
    const input = card?.querySelector('.input-link-nr')
    const link = input?.value?.trim() || ''

    if (link && !link.includes('youtube.com') && !link.includes('youtu.be')) {
        toast('Informe um link válido do YouTube', 'warn')
        return
    }

    btn.disabled = true
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'

    try {
        const { data: existente, error: erroBusca } = await sb
            .from('videoaulas')
            .select('id')
            .eq('nr_id', nrNum)
            .limit(1)
            .maybeSingle()

        if (erroBusca) throw erroBusca

        if (existente?.id) {
            const { error } = await sb.from('videoaulas')
                .update({ url_video: link, atualizado_em: new Date().toISOString() })
                .eq('id', existente.id)
            if (error) throw error
        } else {
            const { error } = await sb.from('videoaulas').insert({
                titulo: `NR ${nrNum}`,
                nr_id: nrNum,
                url_video: link,
                ordem: 0
            })
            if (error) throw error
        }

        toast(`Link da NR ${nrNum} atualizado com sucesso!`, 'success')
        await carregarVideoaulasData()
    } catch (err) {
        console.error('Erro ao salvar link:', err)
        toast('Erro ao salvar: ' + (err.message || 'Erro inesperado'), 'err')
        btn.disabled = false
        btn.innerHTML = '<i class="fas fa-save"></i> Salvar Link'
    }
}

// Tornar funções acessíveis globalmente para listeners inline
window.filtrarVideoaulas = filtrarVideoaulas
window.filtrarCategoriaVa = filtrarCategoriaVa
window.abrirPlayerNr = abrirPlayerNr
window.fecharModalVideo = fecharModalVideo
window.concluirAulaAtual = concluirAulaAtual
window.salvarLinkNr = salvarLinkNr
