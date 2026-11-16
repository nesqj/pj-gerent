import { useState } from 'react'
import { t } from '../i18n.js'
import { hoje } from '../utils.js'
import {
  IconeAjuda, IconeCaixaProduto, IconeCaminhao, IconeCheck, IconeConfig, IconeDireita, IconeEscudo,
  IconeFechar, IconeLapis, IconeLoja, IconeSair, IconeSeta, IconeUsuarios,
} from '../icones.jsx'

// Tela "Minha conta": abre ao tocar na foto de perfil. Mostra quem está logado, as lojas
// e o atalho para as abas que não ficam na barra de baixo (Estoque, Fornecedores, Clientes...).
const PAPEIS = { admin: 'Administrador da loja', gerente: 'Gerente', vendedor: 'Vendedor', leitor: 'Só leitura' }

export function Avatar({ perfil, nome, grande }) {
  return perfil?.avatar
    ? <img className={'avatar' + (grande ? ' avatar-grande' : '')} src={perfil.avatar} alt="" />
    : <span className={'avatar avatar-letra' + (grande ? ' avatar-grande' : '')}>{(nome || '?').trim()[0]?.toUpperCase()}</span>
}

export default function MinhaConta({ db, perfil, nome, email, loja, lojas, adminPlataforma, podeVer, irPara, onFechar, onTrocarLoja, onAdmin, onSair }) {
  const [lojasAbertas, setLojasAbertas] = useState(true)
  const mes = hoje().slice(0, 7)
  const vendasMes = (db?.vendas || []).filter((v) => String(v.dia).startsWith(mes)).length
  const clientes = (db?.clientes || []).length
  const lista = loja && !lojas.some((l) => l.id === loja.id) ? [...lojas, loja] : lojas
  const abrirPerfil = () => { try { sessionStorage.setItem('abrir-config', 'perfil') } catch { /* sem acesso */ } irPara('config') }

  const atalhos = [
    { id: 'estoque', nome: 'Estoque', icone: IconeCaixaProduto },
    { id: 'forn', nome: 'Fornecedores', icone: IconeCaminhao },
    { id: 'clientes', nome: 'Clientes', icone: IconeUsuarios },
    { id: 'ajuda', nome: 'Central de ajuda', icone: IconeAjuda },
    { id: 'config', nome: 'Configurações', icone: IconeConfig },
  ].filter((a) => podeVer(a.id))

  return (
    <section className="minha-conta">
      <div className="mc-topo">
        <button className="icone-btn" onClick={onFechar} aria-label={t('Fechar')}><IconeFechar /></button>
        <button className="icone-btn" onClick={() => irPara('config')} aria-label={t('Configurações')}><IconeConfig /></button>
      </div>

      <div className="mc-perfil">
        <button className="mc-foto" onClick={abrirPerfil} aria-label={t('Editar perfil')}>
          <Avatar perfil={perfil} nome={nome} grande />
          <span className="mc-lapis"><IconeLapis /></span>
        </button>
        <b className="mc-nome">{nome}</b>
        {email && email !== nome && <small className="mc-email">{email}</small>}
        {loja?.papel && <span className="mc-papel">{t(PAPEIS[loja.papel] || loja.papel)}</span>}
      </div>

      <div className="mc-numeros">
        <div className="mc-numero"><b>{vendasMes}</b><small>{t('Vendas no mês')}</small></div>
        <div className="mc-numero"><b>{clientes}</b><small>{t('Clientes')}</small></div>
      </div>

      {lista.length > 0 && (
        <>
          <button className="mc-secao" onClick={() => setLojasAbertas(!lojasAbertas)}>
            <span>{t('Suas lojas')}</span><IconeSeta aberto={lojasAbertas} />
          </button>
          {lojasAbertas && (
            <div className="mc-lojas">
              {lista.map((l) => (
                <button key={l.id} className={'mc-loja' + (l.id === loja?.id ? ' ativa' : '')} onClick={() => l.id !== loja?.id && onTrocarLoja(l)}>
                  <span className="mc-loja-icone"><IconeLoja /></span>
                  <span className="mc-loja-txt"><b>{l.nome}</b><small>{t(PAPEIS[l.papel] || l.papel || '')}</small></span>
                  {l.id === loja?.id && <span className="mc-ok"><IconeCheck /></span>}
                </button>
              ))}
              {adminPlataforma && (
                <button className="mc-loja mc-loja-nova" onClick={onAdmin}>
                  <span className="mc-loja-icone"><IconeEscudo /></span>
                  <span className="mc-loja-txt"><b>{t('Admin Plataforma')}</b><small>{t('Gerenciar organizações')}</small></span>
                  <IconeDireita />
                </button>
              )}
            </div>
          )}
        </>
      )}

      <div className="mc-menu">
        {atalhos.map((a) => (
          <button key={a.id} className="mc-item" onClick={() => irPara(a.id)}>
            <a.icone /><span>{t(a.nome)}</span><IconeDireita />
          </button>
        ))}
        <button className="mc-item mc-sair" onClick={onSair}>
          <IconeSair /><span>{t('Sair')}</span>
        </button>
      </div>
    </section>
  )
}
