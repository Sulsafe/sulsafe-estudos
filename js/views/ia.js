// ============================================================
// VIEW: SECRETÁRIA SULSAFE (IA 1 — local, grátis, sem API)
// ============================================================
// A Secretária é a recepcionista da plataforma. Não cria curso,
// não responde prova e não usa internet. Toda resposta vem da
// base interna (base-conhecimento-sulsafe.js) e passa pelo
// sanitizador da Tarefa 1 antes de entrar no DOM.
import { nav } from '../state.js'
import { handleError, $$ } from '../utils.js'
import { escapeHTML, renderizarMensagemIA } from '../chat-seguro.js'
import { responderSecretaria, buscarPagina, paginaEhValida } from '../base-conhecimento-sulsafe.js'

export function vIA() {
    let h = `<div class="btn-back" onclick="nav('inicio')"><i class="fas fa-arrow-left"></i> Voltar</div>`
    h += `<h2 class="wc">Secretária SulSafe</h2><p class="wcs">Dúvidas sobre a plataforma e as 38 NRs. Inclusa, local e sem custo — sem internet e sem API externa.</p>`
    h += `<div style="display:flex;flex-direction:column;gap:16px;max-width:700px;margin:0 auto;">`
    h += `<div style="background:var(--ip);border-radius:var(--radius);padding:20px;border:1px solid var(--bd);">`
    h += `<div id="chatMessages" style="min-height:200px;max-height:400px;overflow-y:auto;margin-bottom:12px;display:flex;flex-direction:column;gap:8px;">`
    h += `<div class="chat-msg bot"><i class="fas fa-robot" style="color:var(--p);margin-right:6px;"></i> Olá! Sou a Secretária da SulSafe. Sei onde fica cada página e o conteúdo dos cards das 38 NRs. Não faço provas nem uso internet. Como posso ajudar?</div>`
    h += `</div>`
    h += `<div style="display:flex;gap:8px;">`
    h += `<input type="text" id="chatInput" placeholder="Ex.: onde fica o certificado? O que é a NR 35?" style="flex:1;padding:12px 16px;border-radius:100px;border:1px solid var(--bd);background:var(--bg);color:var(--tx);">`
    h += `<button class="btn btn-p" id="chatSend"><i class="fas fa-paper-plane"></i></button>`
    h += `</div>`
    h += `</div>`
    // Sugestões rápidas: valores escapados e sem inline JS interpolado.
    h += `<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">`
    const sugestoes = [
        'Onde fica o certificado?',
        'O que é a NR 35?',
        'Onde envio um trabalho?',
        'Como é a cobrança?',
        'Você usa internet?'
    ]
    sugestoes.forEach((s) => {
        const segura = escapeHTML(s)
        h += `<button class="btn btn-sm btn-s btn-sugestao" data-pergunta="${segura}">${segura}</button>`
    })
    h += `</div>`
    h += `</div>`

    setTimeout(() => {
        const input = document.getElementById('chatInput')
        const send = document.getElementById('chatSend')
        if (!input || !send) return

        const handler = () => {
            const pergunta = input.value.trim()
            if (!pergunta) return

            const chat = document.getElementById('chatMessages')
            if (!chat) return

            // Mensagem do usuário: estrutura estática no innerHTML, texto por textContent.
            const msgUsuario = document.createElement('div')
            msgUsuario.className = 'chat-msg user'
            msgUsuario.innerHTML = '<i class="fas fa-user" style="color:var(--p);margin-right:6px;"></i> '
            msgUsuario.appendChild(document.createTextNode(pergunta))
            chat.appendChild(msgUsuario)

            input.value = ''
            chat.scrollTop = chat.scrollHeight

            let resposta
            try {
                // Sem delay, sem fetch: a resposta já está dentro da plataforma.
                resposta = responderSecretaria(pergunta)
            } catch (erro) {
                handleError(erro)
                resposta = 'Não consegui responder agora. Tente novamente.'
            }

            // Resposta da Secretária: Markdown -> HTML -> Sanitização (Tarefa 1).
            const msgBot = document.createElement('div')
            msgBot.className = 'chat-msg bot'
            msgBot.innerHTML = '<i class="fas fa-robot" style="color:var(--p);margin-right:6px;"></i> '
            const conteudo = document.createElement('span')
            conteudo.innerHTML = renderizarMensagemIA(resposta)
            msgBot.appendChild(conteudo)
            chat.appendChild(msgBot)

            // Atalho de navegação apenas para páginas conhecidas e validadas.
            const pagina = buscarPagina(pergunta)
            if (pagina && paginaEhValida(pagina.view)) {
                const atalho = document.createElement('button')
                atalho.className = 'btn btn-sm btn-p btn-ir-secretaria'
                atalho.type = 'button'
                atalho.textContent = 'Abrir ' + pagina.titulo
                atalho.onclick = () => nav(pagina.view)
                msgBot.appendChild(atalho)
            }

            chat.scrollTop = chat.scrollHeight
        }

        send.onclick = handler
        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handler() })

        $$('.btn-sugestao').forEach((botao) => {
            botao.onclick = () => {
                input.value = botao.dataset.pergunta || ''
                handler()
            }
        })
    }, 100)

    return h
}

window.vIA = vIA
