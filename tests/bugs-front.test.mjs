import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = caminho => fs.readFileSync(new URL(caminho, import.meta.url), 'utf8')

const videoaulas = ler('../js/videoaulas.js')
const nrs = ler('../js/views/nrs.js')
const pendentes = ler('../js/views/pendentes.js')
const admin = ler('../js/views/admin.js')
const config = ler('../js/views/config.js')

test('filtros de videoaulas declaram as classes no atributo class', () => {
    assert.match(videoaulas, /class="btn btn-sm btn-p filtro-va-btn on"/)

    for (const filtro of ['gerais', 'especificas', 'setoriais', 'concluidas']) {
        assert.match(
            videoaulas,
            new RegExp(`class="btn btn-sm btn-s filtro-va-btn"[^>]*data-filtro="${filtro}"`),
            `faltou classe CSS no filtro ${filtro}`
        )
    }

    // Classe dentro de style era silenciosamente descartada pelo navegador.
    assert.doesNotMatch(videoaulas, /style="[^"]*filtro-va-btn/)
})

test('catálogo de NRs não oferece filtro para categoria inexistente', () => {
    assert.doesNotMatch(nrs, /filterNR\('saude'\)/)
    for (const categoria of ['all', 'gerais', 'especificas', 'setoriais']) {
        assert.match(nrs, new RegExp(`filterNR\\('${categoria}'\\)`))
    }
})

test('lista de pendentes usa a coluna real criado_em', () => {
    assert.match(pendentes, /fmtD\(u\.criado_em\)/)
    assert.doesNotMatch(pendentes, /u\.created_at/)
})

test('pendentes não sobrescreve window.liberarUsuario usado pelo ADMIN', () => {
    assert.match(admin, /window\.liberarUsuario = async function/)
    // Só é proibida a ATRIBUIÇÃO da global; comentários podem citá-la.
    assert.doesNotMatch(pendentes, /window\.liberarUsuario\s*=/)
    assert.match(pendentes, /btn-liberar-pendente/)
    assert.match(pendentes, /addEventListener\('click'/)
    assert.match(pendentes, /async function liberarPendente\(id\)/)
})

test('troca de tema usa o elemento clicado, sem depender do global event', () => {
    assert.match(config, /onclick="setTema\('\$\{t\.id\}', this\)"/)
    assert.match(config, /function setTema\(id, el\)/)
    assert.match(config, /el\?\.classList\.add\('on'\)/)
    assert.doesNotMatch(config, /\bevent\.currentTarget\b/)
})
