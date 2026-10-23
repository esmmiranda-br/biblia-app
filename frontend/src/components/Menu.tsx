import React, { useState } from 'react';

import { Sermoes } from './Sermoes';
import { Usuarios } from './Usuarios';
import Biblia from './Biblia';
import { Estudos } from './Estudos';


interface MenuProps {
  usuario: { id: number; usuario: string; perfil: string };
  onLogout: () => void;
}

type Tela = 'menu' | 'sermao' | 'biblia' | 'usuario' | 'estudos';



export const Menu: React.FC<MenuProps> = ({ usuario, onLogout }) => {
  const [tela, setTela] = useState<Tela>('menu');

  if (tela === 'sermao') return <Sermoes usuario={usuario} onSair={() => setTela('menu')} />;
  if (tela === 'biblia') return <Biblia onSair={() => setTela('menu')} />;
  if (tela === 'usuario') return <Usuarios usuario={usuario} onSair={() => setTela('menu')} />;
  if (tela === 'estudos') return <Estudos usuario={usuario.usuario} perfil={usuario.perfil} onSair={() => setTela('menu')} />;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #4e54c8 0%, #8f94fb 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff',
        padding: '2rem',
        borderRadius: 16,
        boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
        minWidth: 320,
        maxWidth: 360,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        alignItems: 'center',
      }}>
        <img
          src="/logo-aplicativo.jpeg"
          alt="Revela — Bíblia, estudos e sermões"
          style={{ width: '100%', maxWidth: 280 }}
        />
        <h2 style={{ color: '#4e54c8', margin: 0 }}>Menu Principal</h2>
        <button style={menuBtnStyle} onClick={() => setTela('sermao')}>Sermão</button>
        <button style={menuBtnStyle} onClick={() => setTela('estudos')}>Estudos</button>
        <button style={menuBtnStyle} onClick={() => setTela('biblia')}>Bíblia</button>
        <button style={menuBtnStyle} onClick={() => setTela('usuario')}>Usuário</button>
        <button style={{ ...menuBtnStyle, background: '#eee', color: '#4e54c8' }} onClick={onLogout}>Sair</button>
      </div>
    </div>
  );
};

const menuBtnStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #4e54c8 0%, #8f94fb 100%)',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '0.75rem 1.5rem',
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
  width: '100%',
  marginBottom: 8,
  transition: 'background 0.2s',
};
