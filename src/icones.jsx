// Ícones em linha (estilo traço fino), desenhados em SVG.
const Svg = ({ children, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

export const IconeCaminhao = () => (
  <Svg><path d="M3 6h11v10H3z" /><path d="M14 9h4l3 3v4h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></Svg>
)
export const IconeCalculadora = () => (
  <Svg><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8" /><path d="M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" /></Svg>
)
export const IconePerfil = () => (
  <Svg><circle cx="12" cy="12" r="9" /><circle cx="12" cy="10" r="3" /><path d="M6.5 18.5a6.5 6.5 0 0 1 11 0" /></Svg>
)
export const IconeEscudo = () => (
  <Svg><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></Svg>
)
export const IconeCelular = () => (
  <Svg><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M11 18.5h2" /></Svg>
)
export const IconePredio = () => (
  <Svg><path d="M4 21V5l8-2v18" /><path d="M12 8l8 2v11" /><path d="M2.5 21h19" /><path d="M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2" /></Svg>
)
export const IconePaleta = () => (
  <Svg><path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="15" cy="7" r="1" /></Svg>
)
export const IconeBackup = () => (
  <Svg><ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" /><path d="M4.5 5.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6" /><path d="M4.5 11.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6" /></Svg>
)
export const IconeSair = () => (
  <Svg><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 8l-4 4 4 4" /><path d="M6 12h10" /></Svg>
)
export const IconeConfig = () => (
  <Svg><circle cx="12" cy="12" r="3" /><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" /><circle cx="12" cy="12" r="6.5" /></Svg>
)
export const IconeAjuda = () => (
  <Svg><path d="M3 5.5A1.5 1.5 0 0 1 4.5 4H10a2 2 0 0 1 2 2v14a1.5 1.5 0 0 0-1.5-1.5h-6A1.5 1.5 0 0 1 3 17z" /><path d="M21 5.5A1.5 1.5 0 0 0 19.5 4H14a2 2 0 0 0-2 2v14a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 0 21 17z" /></Svg>
)
export const IconeAjustes = () => (
  <Svg><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></Svg>
)
export const IconeCarrinho = () => (
  <Svg><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h3l2.6 12.2a1.5 1.5 0 0 0 1.5 1.2h8.8a1.5 1.5 0 0 0 1.5-1.1L21 8H6" /></Svg>
)
export const IconeCaixaProduto = () => (
  <Svg><path d="M3 7l9-4 9 4-9 4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></Svg>
)
export const IconeGrafico = () => (
  <Svg><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-4" /><path d="M12 16V8" /><path d="M16 16v-6" /><path d="M20 16V6" /></Svg>
)
export const IconeBaixar = () => (
  <Svg><path d="M12 4v11" /><path d="M7 10l5 5 5-5" /><path d="M5 20h14" /></Svg>
)
export const IconeSubir = () => (
  <Svg><path d="M12 15V4" /><path d="M7 9l5-5 5 5" /><path d="M5 20h14" /></Svg>
)
export const IconeSeta = ({ aberto }) => (
  <Svg size={16}><path d={aberto ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'} /></Svg>
)
export const IconeRecolher = ({ recolhido }) => (
  <Svg size={18}>
    {recolhido ? <><path d="M6 7l5 5-5 5" /><path d="M13 7l5 5-5 5" /></> : <><path d="M18 7l-5 5 5 5" /><path d="M11 7l-5 5 5 5" /></>}
  </Svg>
)
export const IconeMenu = () => (
  <Svg size={22}><path d="M4 7h16M4 12h16M4 17h16" /></Svg>
)
