

import React, { useState } from 'react';
import { BibliaPopup } from './BibliaPopup';

interface SermaoConsultaProps {
  nome: string;
  conteudo: string;
  onClose: () => void;
}

export const SermaoConsulta: React.FC<SermaoConsultaProps> = ({ nome, conteudo, onClose }) => {
  const [fontSize, setFontSize] = useState<number>(20);
  const [popupRef, setPopupRef] = useState<string|null>(null);

  // Regex para citações bíblicas: nomes compostos/acentuados e intervalos (ex: Lucas 9:57-62, Gálatas 6:2)
  const refRegex = /([1-3]?\s?[A-Za-zÀ-ÿçÇãõéíúâêô\- ]+)\s*(\d+):(\d+)(?:-(\d+))?/gi;

  // Função para transformar citações em links
  const parseConteudo = (texto: string) => {
    const partes: (string|React.ReactNode)[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;
    while ((match = refRegex.exec(texto)) !== null) {
      const ref = match[0];
      const idx = match.index;
      if (idx > lastIdx) partes.push(texto.slice(lastIdx, idx));
      partes.push(
        <a key={idx} href="#" style={{ color: '#4e54c8', textDecoration: 'underline', cursor: 'pointer' }} onClick={e => { e.preventDefault(); setPopupRef(ref); }}>{ref}</a>
      );
      lastIdx = idx + ref.length;
    }
    if (lastIdx < texto.length) partes.push(texto.slice(lastIdx));
    return partes;
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #4e54c8 0%, #8f94fb 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 0',
    }}>
      <div style={{
        background: '#fff',
        padding: '2rem',
        borderRadius: 16,
        boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
        minWidth: 320,
        maxWidth: 700,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
          <button
            type="button"
            style={{ ...btnStyle, background: '#eee', color: '#4e54c8', width: 120 }}
            onClick={onClose}
          >
            Sair
          </button>
        </div>
        <h2 style={{ color: '#4e54c8', margin: 0, textAlign: 'center' }}>{nome}</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button onClick={() => setFontSize((f: number) => Math.max(12, f - 2))} style={btnStyle}>A-</button>
          <button onClick={() => setFontSize((f: number) => Math.min(48, f + 2))} style={btnStyle}>A+</button>
        </div>
        <div style={{
          fontSize,
          lineHeight: 1.6,
          color: '#222',
          width: '100%',
          background: '#f7f7fa',
          borderRadius: 8,
          padding: 16,
          minHeight: 120,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}>{parseConteudo(conteudo)}</div>
        <button style={{ ...btnStyle, background: '#eee', color: '#4e54c8', width: 120 }} onClick={onClose}>Sair</button>
      </div>
      {popupRef && <BibliaPopup referencia={popupRef} onClose={() => setPopupRef(null)} />}
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #4e54c8 0%, #8f94fb 100%)',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '0.5rem 1rem',
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background 0.2s',
};
