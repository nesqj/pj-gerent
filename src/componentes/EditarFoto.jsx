import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { aviso } from '../avisos-tela.jsx'
import { t } from '../i18n.js'
import { IconeFechar } from '../icones.jsx'
import { Avatar } from './MinhaConta.jsx'

// "Editar imagem": escolhe a foto de perfil pela galeria ou pela câmera.
// A foto é recortada no centro (quadrada) e reduzida para 128 px, para ficar leve (fica guardada no perfil da conta).
const LADO = 128

async function prepararFoto(arquivo) {
  if (!arquivo || !/^image\//.test(arquivo.type)) throw new Error(t('Escolha um arquivo de imagem.'))
  const url = URL.createObjectURL(arquivo)
  try {
    const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = url })
    const lado = Math.min(img.naturalWidth, img.naturalHeight)
    const c = document.createElement('canvas')
    c.width = LADO; c.height = LADO
    c.getContext('2d').drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, LADO, LADO)
    let foto = c.toDataURL('image/jpeg', 0.82)
    if (foto.length > 14000) foto = c.toDataURL('image/jpeg', 0.6)
    return foto
  } finally { URL.revokeObjectURL(url) }
}

export default function EditarFoto({ perfil, nome, executar, onFechar }) {
  const galeria = useRef(null)
  const camera = useRef(null)
  const [salvando, setSalvando] = useState(false)

  async function escolher(e) {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo) return
    setSalvando(true)
    try {
      const foto = await prepararFoto(arquivo)
      if (await executar((A) => A.salvarPerfil({ ...perfil, avatar: foto }), t('Foto atualizada.'))) onFechar()
    } catch (err) {
      aviso.alerta(err.message || t('Não foi possível usar esta imagem.'))
    } finally { setSalvando(false) }
  }
  async function remover() {
    setSalvando(true)
    if (await executar((A) => A.salvarPerfil({ ...perfil, avatar: '' }), t('Foto removida.'))) onFechar()
    setSalvando(false)
  }

  // abre por cima de tudo (fora da folha "Minha conta", que tem animação e prenderia a telinha dentro dela)
  return createPortal(
    <div className="notif-fundo foto-fundo" onClick={(e) => { e.stopPropagation(); onFechar() }}>
      <div className="foto-folha" role="dialog" aria-label={t('Editar imagem')} onClick={(e) => e.stopPropagation()}>
        <div className="notif-topo"><button className="in-icone" onClick={onFechar} aria-label={t('Fechar')}><IconeFechar /></button></div>
        <div className="foto-previa"><Avatar perfil={perfil} nome={nome} /></div>
        <h3 className="foto-titulo">{t('Editar imagem')}</h3>
        <p className="foto-sub">{t('De onde você quer capturar a imagem?')}</p>
        <button className="foto-botao" disabled={salvando} onClick={() => galeria.current?.click()}>{salvando ? t('Salvando...') : t('Galeria')}</button>
        <button className="foto-botao claro" disabled={salvando} onClick={() => camera.current?.click()}>{t('Câmera')}</button>
        {perfil?.avatar && <button className="link pequeno foto-remover" disabled={salvando} onClick={remover}>{t('Remover foto')}</button>}
        <input ref={galeria} type="file" accept="image/*" hidden onChange={escolher} />
        <input ref={camera} type="file" accept="image/*" capture="user" hidden onChange={escolher} />
      </div>
    </div>,
    document.body,
  )
}
