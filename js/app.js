// ============================================================
// APP - FUNÇÕES PRINCIPAIS DO DASHBOARD & SHELL SPA
// ============================================================

import { S, nav, role, uid, fmtD } from './state.js'
import { sbGetNotificacoes, sbMarcarNotificacaoLida, sbMarcarTodasNotificacoesLidas } from './supabase-client.js'
import { toast, sanitizar, $, $$ } from './utils.js'

let listaNotificacoes = []
let unreadCount = 0

// Notificações padrão de boas-vindas / fallback se tabela estiver vazia
const NOTIFS_SISTEMA = [
    {
        id: 'notif-bem-vindo',
        titulo: 'Bem-vindo(a) à SulSafe!',
        mensagem: 'Explore as 38 NRs, assista às videoaulas e participe do Fórum da Comunidade.',
        link: 'inicio',
        lida: false,
        criado_em: new Date().toISOString()
    },
    {
        id: 'notif-forum',
        titulo: 'Novo Fórum Disponível 💬',
        mensagem: 'Tire suas dúvidas técnicas com os instrutores na nova aba de Comunidade.',
        link: 'forum',
        lida: false,
        criado_em: new Date(Date.now() - 3600000 * 2).toISOString()
    }
]

export function renderSB() {
    const sidebar = document.getElementById('appSidebar')
    if (!sidebar) return
    const r = role()
    const userNome = S.user?.nome_completo || 'Aluno SulSafe'

    // Define a view ativa de forma segura
    const currentView = S.view || S.currentView || 'inicio'

    let h = `
        <div class="sb-hd">
            <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
                <div class="lic"><i class="fas fa-shield-halved"></i></div>
                <div class="lt">SulSafe</div>
            </div>
            <div class="sb-notif-wrap" id="sbNotifWrap">
                <button class="sb-notif-btn" id="sbNotifBtn" onclick="window.toggleNotifDropdown(event)" title="Notificações">
                    <i class="fas fa-bell"></i>
                    <span class="sb-notif-badge" id="sbNotifBadge" style="display:${unreadCount > 0 ? 'flex' : 'none'}">${unreadCount}</span>
                </button>
                <div class="sb-notif-dropdown" id="sbNotifDropdown">
                    <div class="sb-notif-header">
                        <span><i class="fas fa-bell" style="color:var(--p)"></i> Notificações</span>
                        <button class="sb-notif-action" onclick="window.marcarTodasNotifsLidas()">Marcar todas como lidas</button>
                    </div>
                    <div class="sb-notif-list" id="sbNotifList">
                        ${renderNotificacoesHTML()}
                    </div>
                </div>
            </div>
        </div>

        <div class="sb-role ${r}">
            <i class="fas ${r === 'admin' ? 'fa-crown' : r === 'professor' ? 'fa-chalkboard-user' : 'fa-user-graduate'}"></i>
            <span>${r === 'admin' ? 'Administrador' : r === 'professor' ? 'Professor' : 'Estudante'}</span>
        </div>

        <nav class="sb-nav">
            <div class="sb-lbl">Aprendizado</div>
    `

    const items = [
        { id: 'inicio', icon: 'fa-house', label: 'Início' },
        { id: 'videoaulas', icon: 'fa-circle-play', label: 'Videoaulas NRs' },
        { id: 'materiais', icon: 'fa-file-lines', label: 'Materiais & Apostilas' },
        { id: 'salas', icon: 'fa-tower-broadcast', label: 'Salas ao Vivo' },
        { id: 'nrs', icon: 'fa-book-open', label: 'Catálogo de NRs' },
        { id: 'ia', icon: 'fa-robot', label: 'Assistente IA' }
    ]

    items.forEach(item => {
        const active = currentView === item.id ? 'on' : ''
        h += `
            <div class="ni ${active}" data-view="${item.id}" onclick="window.nav('${item.id}')">
                <i class="fas ${item.icon}"></i>
                <span>${item.label}</span>
            </div>
        `
    })

    // NOVO GRUPO: COMUNIDADE
    h += `<div class="sb-lbl" style="margin-top:14px">Comunidade</div>`
    const isForumActive = currentView === 'forum' ? 'on' : ''
    h += `
        <div class="ni ${isForumActive}" data-view="forum" onclick="window.nav('forum')">
            <i class="fas fa-comments"></i>
            <span>Fórum de Dúvidas</span>
        </div>
    `

    h += `<div class="sb-lbl" style="margin-top:14px">Acadêmico</div>`

    const academicItems = []
    if (r === 'aluno') {
        academicItems.push({ id: 'boletim', icon: 'fa-chart-simple', label: 'Meu Boletim' })
        academicItems.push({ id: 'provas', icon: 'fa-file-pdf', label: 'Minhas Provas' })
        academicItems.push({ id: 'certificados', icon: 'fa-award', label: 'Certificados' })
    } else {
        academicItems.push({ id: 'boletim', icon: 'fa-pen-to-square', label: 'Lançar Notas' })
        academicItems.push({ id: 'provas', icon: 'fa-file-signature', label: 'Corrigir Provas' })
        academicItems.push({ id: 'certificados', icon: 'fa-award', label: 'Certificados' })
    }

    if (r === 'admin') {
        academicItems.push({ id: 'pendentes', icon: 'fa-user-clock', label: 'Aprovações' })
        academicItems.push({ id: 'admin', icon: 'fa-shield-halved', label: 'Modo Deus' })
    }

    academicItems.push({ id: 'config', icon: 'fa-gear', label: 'Configurações' })

    academicItems.forEach(item => {
        const active = currentView === item.id ? 'on' : ''
        h += `
            <div class="ni ${active}" data-view="${item.id}" onclick="window.nav('${item.id}')">
                <i class="fas ${item.icon}"></i>
                <span>${item.label}</span>
            </div>
        `
    })

    h += `
        </nav>
        <div class="sb-ft">
            <div class="sb-name" title="${userNome}">${userNome}</div>
            <div class="sb-out" onclick="window.logout()" title="Sair da Plataforma">
                <i class="fas fa-power-off"></i>
            </div>
        </div>
    `

    sidebar.innerHTML = h
}

function renderNotificacoesHTML() {
    if (!listaNotificacoes || listaNotificacoes.length === 0) {
        return `
            <div class="empty" style="padding:24px 16px;font-size:12px">
                <i class="fas fa-bell-slash" style="font-size:24px;margin-bottom:8px"></i>
                <p>Nenhuma notificação no momento</p>
            </div>
        `
    }

    return listaNotificacoes.map(n => {
        const unread = !n.lida
        const timeAgo = n.criado_em ? fmtD(n.criado_em) : 'Hoje'

        return `
            <div class="sb-notif-item ${unread ? 'unread' : ''}" onclick="window.clicarNotificacao('${n.id}', '${n.link || ''}')">
                <div class="sb-notif-item-ic">
                    <i class="fas ${n.link === 'forum' ? 'fa-comments' : n.link === 'boletim' ? 'fa-chart-line' : 'fa-info-circle'}"></i>
                </div>
                <div style="flex:1;min-width:0">
                    <div class="sb-notif-item-title">${sanitizar(n.titulo)}</div>
                    <div class="sb-notif-item-msg">${sanitizar(n.mensagem)}</div>
                    <div class="sb-notif-item-time">${timeAgo}</div>
                </div>
            </div>
        `
    }).join('')
}

export function renderV(view) {
    const content = document.getElementById('appContent')
    if (!content) return
    const fn = S.views[view]
    if (typeof fn === 'function') {
        try {
            const res = fn()
            if (typeof res === 'string') {
                content.innerHTML = res
            } else if (res && typeof res.then === 'function') {
                res.then(html => {
                    if (typeof html === 'string') {
                        content.innerHTML = html
                    }
                }).catch(err => {
                    console.error('Erro na renderização assíncrona:', err)
                })
            }
        } catch (e) {
            console.error('Erro ao renderizar view:', e)
        }
    } else {
        content.innerHTML = `<div class="empty"><i class="fas fa-triangle-exclamation"></i><h4>Módulo em manutenção</h4><p>A tela "${view}" está sendo atualizada.</p></div>`
    }
}

export function enterDash() {
    document.body.classList.add('dash-active')
    const authWrap = document.getElementById('authWrap')
    if (authWrap) authWrap.classList.add('off')
    const appWrap = document.getElementById('appWrap')
    if (appWrap) appWrap.classList.remove('off')
    
    // Atualiza a view atual no state antes de renderizar
    if (!S.view) S.view = 'inicio'
    
    if (S.sidebar) S.sidebar()
    renderV(S.view || 'inicio')
    checkNotifs()
}

// ============================================================
// GESTÃO DE NOTIFICAÇÕES
// ============================================================
export async function checkNotifs() {
    const userId = uid()

    try {
        if (userId) {
            const { data, error } = await sbGetNotificacoes(userId, 8)
            if (!error && data && data.length > 0) {
                listaNotificacoes = data
            } else {
                listaNotificacoes = NOTIFS_SISTEMA
            }
        } else {
            listaNotificacoes = NOTIFS_SISTEMA
        }
    } catch (e) {
        console.warn('Fallback de notificações:', e)
        listaNotificacoes = NOTIFS_SISTEMA
    }

    atualizarBadgeNotificacoes()
}

function atualizarBadgeNotificacoes() {
    unreadCount = (listaNotificacoes || []).filter(n => !n.lida).length
    const badge = document.getElementById('sbNotifBadge')
    if (badge) {
        badge.textContent = unreadCount
        badge.style.display = unreadCount > 0 ? 'flex' : 'none'
    }

    const listContainer = document.getElementById('sbNotifList')
    if (listContainer) {
        listContainer.innerHTML = renderNotificacoesHTML()
    }
}

export function toggleNotifDropdown(event) {
    if (event) event.stopPropagation()
    const dropdown = document.getElementById('sbNotifDropdown')
    if (dropdown) {
        dropdown.classList.toggle('show')
    }
}

export async function clicarNotificacao(id, link) {
    const notif = listaNotificacoes.find(n => String(n.id) === String(id))
    if (notif) {
        notif.lida = true
    }

    try {
        await sbMarcarNotificacaoLida(id)
    } catch (e) {
        // Fallback gracioso
    }

    atualizarBadgeNotificacoes()

    const dropdown = document.getElementById('sbNotifDropdown')
    if (dropdown) dropdown.classList.remove('show')

    if (link && S.views[link]) {
        nav(link)
    }
}

export async function marcarTodasNotifsLidas() {
    (listaNotificacoes || []).forEach(n => { n.lida = true })

    const userId = uid()
    if (userId) {
        try {
            await sbMarcarTodasNotificacoesLidas(userId)
        } catch (e) {}
    }

    toast('Todas as notificações foram marcadas como lidas', 'info')
    atualizarBadgeNotificacoes()
}

// Fechar dropdown ao clicar fora
document.addEventListener('click', (e) => {
    const wrap = document.getElementById('sbNotifWrap')
    const dropdown = document.getElementById('sbNotifDropdown')
    if (dropdown && wrap && !wrap.contains(e.target)) {
        dropdown.classList.remove('show')
    }
})

// Tornar funções globais
window.enterDash = enterDash
window.renderSB = renderSB
window.renderV = renderV
window.checkNotifs = checkNotifs
window.toggleNotifDropdown = toggleNotifDropdown
window.clicarNotificacao = clicarNotificacao
window.marcarTodasNotifsLidas = marcarTodasNotifsLidas