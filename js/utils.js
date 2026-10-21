
// ============================================================
// UTILS - FUNÇÕES UTILITÁRIAS
// ============================================================

import { S } from './state.js'

export const ADMIN_EMAIL = 'sulsafetreinamentos@gmail.com'

// DOM helpers
export const $ = (sel) => document.querySelector(sel)
export const $$ = (sel) => document.querySelectorAll(sel)

// Toast notification
export function toast(msg, type = 'info') {
    const div = document.createElement('div')
    div.className = `toast toast-${type}`
    div.textContent = String(msg ?? '')
    div.style.cssText = `
        position: fixed; bottom: 24px; right: 24px;
        background: ${type === 'err' ? '#D32F2F' : type === 'warn' ? '#ED6C02' : type === 'success' ? '#2E7D32' : '#1565C0'};
        color: #fff; padding: 14px 24px; border-radius: 12px;
        font-weight: 600; font-size: 14px; z-index: 9999;
        box-shadow: 0 8px 24px rgba(0,0,0,.2);
        max-width: 420px; animation: toastIn .3s ease;
        font-family: 'Inter', sans-serif;
    `
    document.body.appendChild(div)

    setTimeout(() => {
        div.style.opacity = '0'
        div.style.transition = 'opacity .3s'
        setTimeout(() => div.remove(), 400)
    }, 4000)
}

// Error handler
export function handleError(error) {
    console.error('Erro:', error)
    toast(error?.message || 'Erro inesperado', 'err')
}

// Modal
export function openMdl(html) {
    let modal = document.getElementById('mdlGlobal')

    if (!modal) {
        modal = document.createElement('div')
        modal.id = 'mdlGlobal'
        modal.style.cssText = `
            position: fixed; inset: 0; z-index: 9998;
            background: rgba(0,0,0,.5); backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center;
            animation: fadeIn .25s ease;
        `
        document.body.appendChild(modal)
    }

    modal.innerHTML = `<div style="background:#fff;border-radius:20px;padding:28px;max-width:520px;width:90%;max-height:90vh;overflow-y:auto;position:relative;box-shadow:0 24px 48px rgba(0,0,0,.25)">${html}</div>`
    modal.style.display = 'flex'

    return modal
}

export function closeMdl() {
    const modal = document.getElementById('mdlGlobal')
    if (modal) modal.style.display = 'none'
}

// Sanitize
export function sanitizar(str) {
    if (!str) return ''

    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }

    return String(str).replace(/[&<>"']/g, m => map[m])
}

// UID
export function uid() {
    return S.user?.id || null
}

// Role helpers
export function role() {
    return S.user?.role || 'aluno'
}

export function isAdmin() {
    return role() === 'admin'
}

export function isProf() {
    return role() === 'professor'
}

// Navigation
export function nav(view) {
    window.nav(view)
}

// Show tab
export function showT(id) {
    document.querySelectorAll('.tab-content').forEach(el => {
        el.style.display = 'none'
    })

    document.querySelectorAll('.tab-btn').forEach(el => {
        el.classList.remove('active')
    })

    const target = document.getElementById(id)
    if (target) target.style.display = 'block'

    const btn = document.querySelector(`.tab-btn[data-tab="${id}"]`)
    if (btn) btn.classList.add('active')
}

// Enter dashboard
export function enterDash() {
    const authWrap = document.getElementById('authWrap')
    if (authWrap) authWrap.classList.add('off')

    const appWrap = document.getElementById('appWrap')
    if (appWrap) appWrap.classList.remove('off')

    if (window.enterDash) window.enterDash()
}

// Default configuration
const DEFAULT_CFG = {
    tema: 'verde',
    qual: 'auto',
    speed: '1',
    vol: 100,
    notifs: true
}

// Load configuration
export function loadCfg() {
    S.cfg = { ...DEFAULT_CFG }

    const saved = localStorage.getItem('ss_cfg')
    if (!saved) return

    try {
        const parsed = JSON.parse(saved)

        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            S.cfg = { ...DEFAULT_CFG, ...parsed }
        }
    } catch (error) {
        console.warn('Configurações locais inválidas:', error)
    }
}

// Save configuration
export function saveCfg() {
    const qual = document.getElementById('cfgQual')
    const speed = document.getElementById('cfgSpeed')
    const vol = document.getElementById('cfgVol')

    if (qual) S.cfg.qual = qual.value
    if (speed) S.cfg.speed = speed.value
    if (vol) S.cfg.vol = Number(vol.value)

    localStorage.setItem('ss_cfg', JSON.stringify(S.cfg))
}

// Style injection for toast animation
const style = document.createElement('style')

style.textContent = `
    @keyframes toastIn {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
    }

    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
`

document.head.appendChild(style)

// Permission helper
export function canManage() {
    const r = role()
    return r === 'admin' || r === 'professor'
}

// Expose functions for global use
window.toast = toast
window.closeMdl = closeMdl
window.openMdl = openMdl
window.nav = nav
window.enterDash = enterDash
window.uid = uid
window.role = role
window.isAdmin = isAdmin
window.isProf = isProf
window.showT = showT
window.$ = $
window.$$ = $$