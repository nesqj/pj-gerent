import { useState } from 'react'
import { t } from '../i18n.js'
import { brl, faturamentoVenda, hoje } from '../utils.js'
import {
  IconeAjuda, IconeCaixaProduto, IconeCaminhao, IconeCheck, IconeConfig, IconeDireita, IconeEscudo,
  IconeFechar, IconeLapis, IconeLista, IconeLoja, IconeSair, IconeSeta, IconeUsuarios,
} from '../icones.jsx'

// "Minha conta": abre por cima da tela ao tocar na foto de perfil. Mostra quem está logado, o nível de venda do mês,
// as lojas e o atalho para as abas que não ficam na barra de baixo (Estoque, Fornecedores, Clientes...).
const PAPEIS = { admin: 'Administrador da loja', gerente: 'Gerente', vendedor: 'Vendedor', leitor: 'Só leitura' }

// Nível de venda pelo faturamento do mês
const NIVEIS = [
  { nome: 'Bronze', ate: 10000, cor: '#cd7f32' },
  { nome: 'Prata', ate: 50000, cor: '#c0c4cc' },
  { nome: 'Ouro', ate: 150000, cor: '#f5c542' },
  { nome: 'Diamante', ate: Infinity, cor: '#7dd3fc' },
]
export function nivelDeVenda(faturamento) {
  const i = NIVEIS.findIndex((n) => faturamento < n.ate)
  const nivel = NIVEIS[i]
  const proximo = NIVEIS[i + 1]
  return { ...nivel, proximo: proximo?.nome, falta: proximo ? Math.round((nivel.ate - faturamento) * 100) / 100 : 0 }
}
const Medalha = ({ cor }) => (
  <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
    <path d="M20 3l14 8v18l-14 8-14-8V11z" fill={cor} opacity=".9" />
    <path d="M20 9l9 5v12l-9 5-9-5V14z" fill="none" stroke="#0006" strokeWidth="1.5" />
    <path d="M20 14l2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1-3.8-3.6 5.2-.8z" fill="#fff9" />
  </svg>
)

export function Avatar({ perfil, nome, grande }) {
  return perfil?.avatar
    ? <img className={'avatar' + (grande ? ' avatar-grande' : '')} src={perfil.avatar} alt="" />
    : <span className={'avatar avatar-letra' + (grande ? ' avatar-grande' : '')}>{(nome || '?').trim()[0]?.toUpperCase()}</span>
}

export default function MinhaConta({ db, perfil, nome, email, loja, lojas, adminPlataforma, podeVer, irPara, onFechar, onTrocarLoja, onAdmin, onSair }) {
  const [lojasAbertas, setLojasAbertas] = useState(true)
  const mes = hoje().slice(0, 7)
  const vendasMes = (db?.vendas || []).filter((v) => String(v.dia).startsWith(mes))
  const faturamentoMes = vendasMes.reduce((s, v) => s + faturamentoVenda(v), 0)
  const nivel = nivelDeVenda(faturamentoMes)
  const lista = loja && !lojas.some((l) => l.id === loja.id) ? [...lojas, loja] : lojas
  const ir = (id) => { onFechar(); irPara(id) }
  const abrirPerfil = () => { try { sessionStorage.setItem('abrir-config', 'perfil') } catch { /* sem acesso */ } ir('config') }

  const atalhos = [
    { id: 'estoque', nome: 'Estoque', icone: IconeCaixaProduto },
    { id: 'forn', nome: 'Fornecedores', icone: IconeCaminhao },
    { id: 'clientes', nome: 'Clientes', icone: IconeUsuarios },
    { id: 'termos', nome: 'Termos e políticas', icone: IconeLista },
    { id: 'ajuda', nome: 'Central de ajuda', icone: IconeAjuda },
  ].filter((a) => podeVer(a.id))

  return (
    <div className="notif-fundo" onClick={onFechar}>
      <div className="notif-folha minha-conta" role="dialog" aria-label={t('Minha conta')} onClick={(e) => e.stopPropagation()}>
        <div className="mc-topo">
          <button className="icone-btn" onClick={onFechar} aria-label={t('Fechar')}><IconeFechar /></button>
          <button className="icone-btn" onClick={() => ir('config')} aria-label={t('Configurações')}><IconeConfig /></button>
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
          <div className="mc-numero">
            <Medalha cor={nivel.cor} />
            <b>{t(nivel.nome)}</b>
            <small>{t('Nível de venda')}</small>
            {nivel.proximo && <small className="mc-falta">{t('Faltam {valor} para {nivel}', { valor: brl(nivel.falta), nivel: t(nivel.proximo) })}</small>}
          </div>
          <div className="mc-numero">
            <span className="mc-numero-icone"><IconeLista /></span>
            <b>{vendasMes.length}</b>
            <small>{t('Vendas no mês')}</small>
          </div>
        </div>

        {lista.length > 0 && (
          <>
            <button className="mc-secao" onClick={() => setLojasAbertas(!lojasAbertas)}>
              <span>{t('Suas lojas')}</span><IconeSeta aberto={lojasAbertas} />
            </button>
            {lojasAbertas && (
              <div className="mc-lojas">
                {lista.map((l) => (
                  <button key={l.id} className={'mc-loja' + (l.id === loja?.id ? ' ativa' : '')} onClick={() => { if (l.id !== loja?.id) { onFechar(); onTrocarLoja(l) } }}>
                    <span className="mc-loja-icone"><IconeLoja /></span>
                    <span className="mc-loja-txt"><b>{l.nome}</b><small>{t(PAPEIS[l.papel] || l.papel || '')}</small></span>
                    {l.id === loja?.id && <span className="mc-ok"><IconeCheck /></span>}
                  </button>
                ))}
                {adminPlataforma && (
                  <button className="mc-loja mc-loja-nova" onClick={() => { onFechar(); onAdmin() }}>
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
            <button key={a.id} className="mc-item" onClick={() => ir(a.id)}>
              <a.icone /><span>{t(a.nome)}</span><IconeDireita />
            </button>
          ))}
          <button className="mc-item mc-sair" onClick={onSair}>
            <IconeSair /><span>{t('Sair')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
