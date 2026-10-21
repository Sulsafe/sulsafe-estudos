// ============================================================
// MAIN - PONTO DE ENTRADA DA APLICAÇÃO (SPA ESTUDANTE/ADMIN)
// ============================================================
import { S, registerView, setRenderSidebar, nav, loadCfg } from './state.js'
import { sb, sbGetUser } from './supabase-client.js'
import { handleLogin, handleCadastro, logout, recuperarSenha } from './auth.js'
import { renderSB, renderV, enterDash, checkNotifs } from './app.js'
import { toast, showT, $, $$ } from './utils.js'

// Views que estão em js/views/
import { vInicio } from './views/inicio.js'
import { vSalas } from './views/salas.js'
import { vNRs } from './views/nrs.js'
import { vIA } from './views/ia.js'
import { vBoletim } from './views/boletim.js'
import { vProvas } from './views/provas.js'
import { vCerts } from './views/certificados.js'
import { vAdmin } from './views/admin.js'
import { vConfig } from './views/config.js'
import { vPendentes } from './views/pendentes.js'
import { vProfessor } from './views/professor.js'
import { vForum } from './views/forum.js'

// Views de catálogo, player e materiais
import { vVideoaulas } from './videoaulas.js'
import { vMateriais } from './materiais.js'

// Registrar todas as views no State
registerView('inicio', vInicio)
registerView('videoaulas', vVideoaulas)
registerView('materiais', vMateriais)
registerView('salas', vSalas)
registerView('nrs', vNRs)
registerView('ia', vIA)
registerView('forum', vForum)
registerView('boletim', vBoletim)
registerView('provas', vProvas)
registerView('certificados', vCerts)
registerView('admin', vAdmin)
registerView('config', vConfig)
registerView('pendentes', vPendentes)
registerView('professor', vProfessor)

setRenderSidebar(renderSB)

// Expor helpers globalmente para templates HTML
window.logout = logout
window.recuperarSenha = recuperarSenha
window.showT = showT
window.nav = nav
window.toast = toast
window.renderSB = renderSB
window.renderV = renderV
window.enterDash = enterDash

// ============================================================
// CONFIGURAR EVENT LISTENERS DOS FORMULÁRIOS DE LOGIN/CADASTRO
// ============================================================
document.getElementById('frmLogin')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = document.getElementById('lEmail')?.value?.trim()?.toLowerCase()
    const password = document.getElementById('lPass')?.value
    await handleLogin(email, password)
})

document.getElementById('frmCad')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const nome = document.getElementById('cNome')?.value?.trim()
    const email = document.getElementById('cEmail')?.value?.trim()?.toLowerCase()
    const password = document.getElementById('cPass')?.value
    const confirm = document.getElementById('cPass2')?.value
    const termos = document.getElementById('cTermos')?.checked
    await handleCadastro(nome, email, password, confirm, termos)
})

// ============================================================
// INICIALIZAÇÃO E AUTO-LOGIN
// ============================================================
;(async function inicializarApp() {
    loadCfg()

    try {
        const { data: { session } } = await sb.auth.getSession()
        if (session?.user?.id) {
            const { data: user } = await sbGetUser(session.user.id)
            if (user) {
                S.user = user
                localStorage.setItem('ss_user', JSON.stringify(user))
                enterDash()
                return
            }
        }

        // Fallback para sessão gravada em storage
        const sessionData = localStorage.getItem('ss_session')
        if (sessionData) {
            const { id } = JSON.parse(sessionData)
            const { data: user } = await sbGetUser(id)
            if (user) {
                S.user = user
                localStorage.setItem('ss_user', JSON.stringify(user))
                enterDash()
                return
            }
        }

        // Se não houver sessão ativa, exibe o container de login
        const authWrap = document.getElementById('authWrap')
        if (authWrap) authWrap.classList.remove('off')
    } catch (e) {
        console.warn('Auto-login:', e)
        const authWrap = document.getElementById('authWrap')
        if (authWrap) authWrap.classList.remove('off')
    }
})()
