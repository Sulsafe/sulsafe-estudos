// ============================================================
// CHAT SEGURO - SANITIZAÇÃO DE MENSAGENS
// ============================================================
// Equivalente determinístico ao DOMPurify para este projeto.
// Motivo: o app já roda com módulos via CDN, mas o chat precisa
// funcionar também em fallback/offline e ser testável no Node.
// Regra: Markdown -> HTML -> Sanitização. Nunca pular a última etapa.
// Allowlist: b, i, ul, li, p, code, pre, a (com rel=noopener).

const TAGS_PERMITIDAS = new Set(['b', 'i', 'ul', 'li', 'p', 'code', 'pre', 'a'])
const TAG_RE = /<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi

// Escapa qualquer texto dinâmico antes de entrar no DOM.
export function escapeHTML(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function escaparAtributo(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

// Só aceita esquemas de link seguros. Qualquer outro vira '#'.
// Exportado para reutilização em links de PDF/arquivos fora do chat.
export function hrefSeguro(valorBruto) {
    const valor = String(valorBruto ?? '').trim()
    return /^(https?:|mailto:)/i.test(valor) ? valor : '#'
}

// Reconstrói a tag permitida do zero: nenhum atributo do texto original sobrevive.
function abrirTagPermitida(nome, atributos) {
    if (nome !== 'a') return `<${nome}>`

    const encontrado = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(atributos)
    const bruto = encontrado ? (encontrado[1] ?? encontrado[2] ?? encontrado[3]) : ''
    const href = hrefSeguro(bruto)

    return `<a href="${escaparAtributo(href)}" rel="noopener noreferrer" target="_blank">`
}

// Sanitizador com allowlist: tags fora da lista são exibidas como TEXTO.
export function sanitizarHTML(html) {
    const fonte = String(html ?? '')
    let saida = ''
    let ultimo = 0
    let correspondencia

    TAG_RE.lastIndex = 0

    while ((correspondencia = TAG_RE.exec(fonte)) !== null) {
        const bruto = correspondencia[0]
        const nome = correspondencia[1].toLowerCase()
        const ehFechamento = bruto.startsWith('</')

        saida += escapeHTML(fonte.slice(ultimo, correspondencia.index))

        if (TAGS_PERMITIDAS.has(nome)) {
            saida += ehFechamento
                ? `</${nome}>`
                : abrirTagPermitida(nome, correspondencia[2] || '')
        } else {
            // <img onerror>, <script>, <iframe>, etc. viram texto visível.
            saida += escapeHTML(bruto)
        }

        ultimo = correspondencia.index + bruto.length
    }

    saida += escapeHTML(fonte.slice(ultimo))
    return saida
}

// Conversor mínimo de Markdown. A intenção é gerar HTML simples;
// a sanitização final é obrigatória em renderizarMensagemIA().
export function markdownParaHTML(texto) {
    const bruto = String(texto ?? '').replace(/\r\n/g, '\n')
    const blocos = bruto.split(/\n\s*\n/)

    return blocos.map((bloco) => {
        const linhas = bloco.split('\n').map((linha) => linha.trim()).filter(Boolean)
        if (!linhas.length) return ''

        if (linhas.every((linha) => /^[-*]\s+/.test(linha))) {
            const itens = linhas.map((linha) => `<li>${linha.replace(/^[-*]\s+/, '')}</li>`)
            return `<ul>${itens.join('')}</ul>`
        }

        const html = linhas.join(' ')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
            .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>')
            .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, textoLink, url) => {
                // Aspas são codificadas para não quebrarem o atributo href.
                const urlSegura = String(url).replace(/"/g, '%22').replace(/'/g, '%27')
                return `<a href="${urlSegura}">${textoLink}</a>`
            })

        return `<p>${html}</p>`
    }).join('')
}

//Pipeline obrigatório para toda saída da IA: Markdown -> HTML -> Sanitizar.
export function renderizarMensagemIA(texto) {
    return sanitizarHTML(markdownParaHTML(texto))
}
