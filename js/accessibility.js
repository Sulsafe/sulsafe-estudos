// ============================================================
// ACESSIBILIDADE GLOBAL
// Ajuste de fonte, alto contraste, redução de movimento e leitura
// em voz alta. Preferências persistidas em localStorage.
// ============================================================

const CHAVE = 'ss_a11y'
const MIN = 90
const MAX = 160
const PASSO = 10

const padrao = { fonte: 100, contraste: false, reduzirMovimento: false, leitura: false, velocidade: 1 }
let prefs = { ...padrao }
let falando = false
let pausado = false

function carregar() {
    try {
        const salvo = JSON.parse(localStorage.getItem(CHAVE) || '{}')
        prefs = { ...padrao, ...salvo }
        prefs.fonte = Math.min(MAX, Math.max(MIN, Number(prefs.fonte) || 100))
        prefs.velocidade = Math.min(2, Math.max(0.6, Number(prefs.velocidade) || 1))
    } catch {
        prefs = { ...padrao }
    }
}

function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(prefs)) } catch { /* armazenamento indisponível */ }
}

function aplicar() {
    const raiz = document.documentElement
    const corpo = document.body
    if (!corpo) return

    const fator = prefs.fonte / 100
    raiz.style.setProperty('--a11y-zoom', String(fator))
    corpo.classList.toggle('a11y-zoom', fator !== 1)
    corpo.classList.toggle('a11y-contrast', Boolean(prefs.contraste))
    corpo.classList.toggle('a11y-reduce-motion', Boolean(prefs.reduzirMovimento))

    const btn = document.getElementById('a11yBtn')
    if (btn) btn.setAttribute('aria-expanded', btn.getAttribute('aria-expanded') === 'true' ? 'true' : 'false')

    const rotuloFonte = document.getElementById('a11yFonteValor')
    if (rotuloFonte) rotuloFonte.textContent = `${prefs.fonte}%`
    const range = document.getElementById('a11yRange')
    if (range && Number(range.value) !== prefs.fonte) range.value = String(prefs.fonte)
    const rate = document.getElementById('a11yRate')
    if (rate && Number(rate.value) !== prefs.velocidade) rate.value = String(prefs.velocidade)

    document.querySelectorAll('[data-a11y-toggle]').forEach(el => {
        const chave = el.dataset.a11yToggle
        const ativo = Boolean(prefs[chave])
        el.setAttribute('aria-pressed', ativo ? 'true' : 'false')
        el.classList.toggle('on', ativo)
    })

    if (!prefs.leitura && falando) pararLeitura()
    atualizarControlesLeitura()
}

function anunciar(mensagem) {
    const alvo = document.getElementById('a11yStatus')
    if (!alvo) return
    alvo.textContent = ''
    window.setTimeout(() => { alvo.textContent = mensagem }, 30)
}

function alterarFonte(delta) {
    prefs.fonte = Math.min(MAX, Math.max(MIN, prefs.fonte + delta * PASSO))
    salvar()
    aplicar()
    anunciar(`Fonte em ${prefs.fonte}%`)
}

function definirFonte(valor) {
    prefs.fonte = Math.min(MAX, Math.max(MIN, Number(valor) || 100))
    salvar()
    aplicar()
}

function alternar(chave) {
    prefs[chave] = !prefs[chave]
    if (chave === 'leitura') {
        if (prefs.leitura) iniciarLeitura()
        else pararLeitura()
    }
    salvar()
    aplicar()
    const nomes = { contraste: 'Alto contraste', reduzirMovimento: 'Redução de movimento', leitura: 'Leitura em voz alta' }
    anunciar(`${nomes[chave]}: ${prefs[chave] ? 'ativado' : 'desativado'}`)
}

function textoParaLeitura() {
    const alvo = document.getElementById('appContent') ||
        document.querySelector('#appWrap:not(.off)') ||
        document.getElementById('authWrap') ||
        document.querySelector('main') ||
        document.body
    return String(alvo.innerText || '')
        .replace(/\s+/g, ' ')
        .replace(/\b(?:[A-Za-z]\.){2,}/g, ' ')
        .trim()
}

function dividirTexto(texto, limite = 220) {
    const partes = []
    let atual = ''
    for (const palavra of texto.split(' ')) {
        if ((atual + ' ' + palavra).trim().length > limite) {
            if (atual) partes.push(atual.trim())
            atual = palavra
        } else {
            atual = `${atual} ${palavra}`
        }
    }
    if (atual.trim()) partes.push(atual.trim())
    return partes
}

function atualizarControlesLeitura() {
    const btn = document.getElementById('a11yBtn')
    if (btn) {
        btn.classList.toggle('reading', falando)
        btn.setAttribute('aria-label', falando
            ? (pausado ? 'Leitura pausada. Abrir opções de acessibilidade' : 'Leitura em voz alta ativa. Abrir opções de acessibilidade')
            : 'Abrir opções de acessibilidade')
    }
    const play = document.getElementById('a11yPlay')
    if (play) {
        play.innerHTML = pausado
            ? '<i class="fas fa-play" aria-hidden="true"></i> Retomar'
            : falando
                ? '<i class="fas fa-pause" aria-hidden="true"></i> Pausar'
                : '<i class="fas fa-play" aria-hidden="true"></i> Iniciar leitura'
        play.disabled = false
    }
    const stop = document.getElementById('a11yStop')
    if (stop) stop.disabled = !falando
    const status = document.getElementById('a11yLeituraStatus')
    if (status) {
        status.textContent = falando ? (pausado ? 'Leitura pausada' : 'Lendo a página') : 'Leitura parada'
        status.classList.toggle('on', falando)
    }
}

function iniciarLeitura() {
    if (!('speechSynthesis' in window)) {
        prefs.leitura = false
        salvar()
        aplicar()
        anunciar('Leitura em voz alta não é suportada neste navegador. Use o leitor de tela do seu dispositivo.')
        return
    }
    pararLeitura()
    const texto = textoParaLeitura()
    if (!texto) return
    const partes = dividirTexto(texto)
    falando = true
    pausado = false
    prefs.leitura = true
    salvar()
    window.speechSynthesis.cancel()
    partes.forEach((parte, indice) => {
        const fala = new SpeechSynthesisUtterance(parte)
        fala.lang = 'pt-BR'
        fala.rate = prefs.velocidade
        if (indice === partes.length - 1) {
            fala.onend = () => {
                falando = false
                pausado = false
                prefs.leitura = false
                salvar()
                aplicar()
                anunciar('Leitura concluída.')
            }
        }
        window.speechSynthesis.speak(fala)
    })
    aplicar()
    anunciar('Lendo o conteúdo da página em voz alta.')
}

function alternarPausaLeitura() {
    if (!('speechSynthesis' in window)) return
    if (!falando) {
        iniciarLeitura()
        return
    }
    if (pausado) {
        window.speechSynthesis.resume()
        pausado = false
        anunciar('Leitura retomada.')
    } else {
        window.speechSynthesis.pause()
        pausado = true
        anunciar('Leitura pausada.')
    }
    atualizarControlesLeitura()
}

function pararLeitura() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    falando = false
    pausado = false
    atualizarControlesLeitura()
}

function alternarPainel(abrir) {
    const painel = document.getElementById('a11yPanel')
    const btn = document.getElementById('a11yBtn')
    if (!painel || !btn) return
    const visivel = typeof abrir === 'boolean' ? abrir : painel.hidden
    painel.hidden = !visivel
    btn.setAttribute('aria-expanded', visivel ? 'true' : 'false')
    if (visivel) painel.querySelector('button')?.focus()
    else btn.focus()
}

function montarInterface() {
    if (document.getElementById('a11yBtn')) return

    const skip = document.createElement('a')
    skip.className = 'a11y-skip'
    skip.href = '#appContent'
    skip.textContent = 'Ir para o conteúdo principal'
    skip.addEventListener('click', (e) => {
        const alvo = document.getElementById('appContent') ||
            document.getElementById('authWrap') ||
            document.querySelector('main') ||
            document.querySelector('h1')
        if (!alvo) return
        e.preventDefault()
        if (!alvo.hasAttribute('tabindex')) alvo.setAttribute('tabindex', '-1')
        alvo.focus()
        alvo.scrollIntoView({ block: 'start' })
    })
    document.body.prepend(skip)

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.id = 'a11yBtn'
    btn.className = 'a11y-btn'
    btn.setAttribute('aria-label', 'Abrir opções de acessibilidade')
    btn.setAttribute('aria-expanded', 'false')
    btn.setAttribute('aria-controls', 'a11yPanel')
    btn.innerHTML = '<i class="fas fa-universal-access" aria-hidden="true"></i>'
    btn.addEventListener('click', () => alternarPainel())

    const painel = document.createElement('section')
    painel.id = 'a11yPanel'
    painel.className = 'a11y-panel'
    painel.hidden = true
    painel.setAttribute('aria-label', 'Opções de acessibilidade')
    painel.innerHTML = `
        <header class="a11y-head">
            <div><span class="a11y-eyebrow">Acessibilidade</span><h2><i class="fas fa-universal-access" aria-hidden="true"></i> Ajustes de leitura</h2></div>
            <button type="button" class="a11y-close" aria-label="Fechar painel de acessibilidade"><i class="fas fa-times" aria-hidden="true"></i></button>
        </header>
        <div class="a11y-row">
            <div><strong>Tamanho do texto</strong><small>Atual: <span id="a11yFonteValor">100%</span></small></div>
            <div class="a11y-font-controls">
                <button type="button" data-a11y-font="-1" aria-label="Diminuir fonte">A−</button>
                <button type="button" data-a11y-font="reset" aria-label="Restaurar fonte">A</button>
                <button type="button" data-a11y-font="1" aria-label="Aumentar fonte">A+</button>
            </div>
        </div>
        <label class="a11y-range-label" for="a11yRange">Fonte <input id="a11yRange" type="range" min="${MIN}" max="${MAX}" step="${PASSO}" value="100"></label>
        <button type="button" class="a11y-toggle" data-a11y-toggle="contraste"><span><i class="fas fa-circle-half-stroke" aria-hidden="true"></i> Alto contraste</span><span class="a11y-switch" aria-hidden="true"></span></button>
        <button type="button" class="a11y-toggle" data-a11y-toggle="reduzirMovimento"><span><i class="fas fa-wind" aria-hidden="true"></i> Reduzir animações</span><span class="a11y-switch" aria-hidden="true"></span></button>
        <div class="a11y-reading">
            <div class="a11y-reading-head"><strong><i class="fas fa-volume-high" aria-hidden="true"></i> Leitura em voz alta</strong><span id="a11yLeituraStatus" class="a11y-reading-status">Leitura parada</span></div>
            <div class="a11y-reading-controls">
                <button type="button" id="a11yPlay" class="a11y-reading-btn primary"><i class="fas fa-play" aria-hidden="true"></i> Iniciar leitura</button>
                <button type="button" id="a11yStop" class="a11y-reading-btn" disabled><i class="fas fa-stop" aria-hidden="true"></i> Parar</button>
            </div>
            <label class="a11y-range-label" for="a11yRate">Velocidade da leitura
                <select id="a11yRate">
                    <option value="0.7">0,7×</option>
                    <option value="0.85">0,85×</option>
                    <option value="1">1× (normal)</option>
                    <option value="1.25">1,25×</option>
                    <option value="1.5">1,5×</option>
                    <option value="2">2×</option>
                </select>
            </label>
        </div>
        <p class="a11y-hint"><i class="fas fa-keyboard" aria-hidden="true"></i> Use Tab para navegar e Esc para fechar este painel.</p>
        <p id="a11yStatus" class="a11y-status" role="status" aria-live="polite"></p>`

    document.body.appendChild(btn)
    document.body.appendChild(painel)

    btn.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') alternarPainel(false)
    })
    painel.querySelector('.a11y-close')?.addEventListener('click', () => alternarPainel(false))
    painel.querySelectorAll('[data-a11y-font]').forEach(b => {
        b.addEventListener('click', () => {
            const valor = b.dataset.a11yFont
            if (valor === 'reset') definirFonte(100)
            else alterarFonte(Number(valor))
        })
    })
    document.getElementById('a11yRange')?.addEventListener('input', (e) => {
        definirFonte(e.target.value)
    })
    painel.querySelectorAll('[data-a11y-toggle]').forEach(b => {
        b.addEventListener('click', () => alternar(b.dataset.a11yToggle))
    })
    document.getElementById('a11yPlay')?.addEventListener('click', alternarPausaLeitura)
    document.getElementById('a11yStop')?.addEventListener('click', () => {
        prefs.leitura = false
        salvar()
        pararLeitura()
        aplicar()
        anunciar('Leitura interrompida.')
    })
    document.getElementById('a11yRate')?.addEventListener('change', (e) => {
        prefs.velocidade = Math.min(2, Math.max(0.6, Number(e.target.value) || 1))
        salvar()
        if (falando) iniciarLeitura()
        else { aplicar(); anunciar(`Velocidade da leitura em ${prefs.velocidade}×.`) }
    })
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !painel.hidden) alternarPainel(false)
    })
    document.addEventListener('click', (e) => {
        if (painel.hidden) return
        if (painel.contains(e.target) || btn.contains(e.target)) return
        alternarPainel(false)
    })
    carregar()
    aplicar()
}

export function initAccessibility() {
    if (typeof document === 'undefined') return
    const iniciar = () => {
        carregar()
        montarInterface()
        aplicar()
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar, { once: true })
    else iniciar()
}

initAccessibility()
