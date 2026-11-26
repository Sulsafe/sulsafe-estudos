// ============================================================
// VALIDAÇÃO PÚBLICA DE CERTIFICADOS (FASE 5.4)
// ============================================================
// Página standalone (/validar.html ou /validar/:hash). A RPC
// sulsafe_validar_certificado_publico devolve somente curso, nota de
// existência/validade e data — nunca nome, CPF, e-mail ou foto do aluno.
// ============================================================

import { sb } from './supabase-client.js'

const campo = document.getElementById('hashCert')
const formulario = document.getElementById('formValidar')
const botao = document.getElementById('btnValidar')
const resultado = document.getElementById('resultado')

function hashDaRota() {
    const partes = window.location.pathname.replace(/\/+$/, '').split('/')
    const indice = partes.indexOf('validar')
    if (indice < 0 || !partes[indice + 1]) return ''
    try {
        return decodeURIComponent(partes[indice + 1])
    } catch {
        return partes[indice + 1]
    }
}

function linha(rotulo, valor) {
    const div = document.createElement('div')
    div.className = 'linha'

    const chave = document.createElement('span')
    chave.textContent = rotulo
    const conteudo = document.createElement('span')
    conteudo.textContent = valor

    div.append(chave, conteudo)
    return div
}

function mostrarResultado(resposta) {
    resultado.replaceChildren()

    const cartao = document.createElement('div')
    const valido = resposta?.valido === true
    cartao.className = `cartao ${valido ? 'valido' : 'invalido'}`

    const titulo = document.createElement('h2')
    titulo.textContent = valido ? 'Certificado válido' : 'Certificado inválido'
    cartao.appendChild(titulo)

    if (valido) {
        cartao.appendChild(linha('Curso', resposta.curso || 'Curso SulSafe'))
        cartao.appendChild(linha('NR', String(resposta.nr_id ?? '—')))
        cartao.appendChild(linha(
            'Emitido em',
            resposta.emitido_em
                ? new Date(resposta.emitido_em).toLocaleDateString('pt-BR')
                : 'Data não informada'
        ))
        cartao.appendChild(linha('Código', String(resposta.codigo ?? '—')))
    } else {
        const aviso = document.createElement('p')
        aviso.textContent = 'Não encontramos um certificado ativo com este código. Confira o hash informado.'
        cartao.appendChild(aviso)
    }

    resultado.appendChild(cartao)
}

export async function validarCertificado(hash) {
    const codigo = String(hash || '').trim()
    if (!codigo) {
        mostrarResultado({ valido: false })
        return { valido: false }
    }

    botao.disabled = true
    resultado.replaceChildren()

    try {
        const { data, error } = await sb.rpc('sulsafe_validar_certificado_publico', {
            p_hash: codigo
        })

        if (error) throw error

        const resposta = data && typeof data === 'object' ? data : { valido: false }
        mostrarResultado(resposta)
        return resposta
    } catch (error) {
        console.error('Validação pública:', error)
        mostrarResultado({ valido: false })
        return { valido: false }
    } finally {
        botao.disabled = false
    }
}

formulario?.addEventListener('submit', event => {
    event.preventDefault()
    validarCertificado(campo?.value)
})

window.validarCertificado = validarCertificado

const hashInicial = hashDaRota()
if (hashInicial && campo) {
    campo.value = hashInicial
    validarCertificado(hashInicial)
}
