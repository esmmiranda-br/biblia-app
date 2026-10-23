import React, { useState } from 'react';


interface LoginProps {
  onLogin: (user: { id: number; usuario: string; perfil: string }) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, senha }),
      });
      if (res.ok) {
        const user = await res.json();
        onLogin(user);
      } else {
        setErro('Usuário ou senha inválidos');
      }
    } catch {
      setErro('Erro de conexão com o servidor');
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #4e54c8 0%, #8f94fb 100%)',
    }}>
      <form onSubmit={handleSubmit} style={{
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
      }}>
        <img
          src="/logo-aplicativo.jpeg"
          alt="Revela — Bíblia, estudos e sermões"
          style={{ width: '100%', maxWidth: 300, alignSelf: 'center' }}
        />
        <h2 style={{ textAlign: 'center', color: '#4e54c8', margin: 0 }}>Acesse sua conta</h2>
        <input
          type="text"
          placeholder="Usuário"
          value={usuario}
          onChange={e => setUsuario(e.target.value)}
          style={{
            padding: '0.75rem',
            borderRadius: 8,
            border: '1px solid #ccc',
            fontSize: 16,
          }}
        />
        <input
          type="password"
          placeholder="Senha"
          value={senha}
          onChange={e => setSenha(e.target.value)}
          style={{
            padding: '0.75rem',
            borderRadius: 8,
            border: '1px solid #ccc',
            fontSize: 16,
          }}
        />
        {erro && <div style={{ color: 'red', textAlign: 'center' }}>{erro}</div>}
        <button
          type="submit"
          style={{
            background: 'linear-gradient(135deg, #4e54c8 0%, #8f94fb 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '0.75rem',
            fontSize: 16,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
            transition: 'background 0.2s',
          }}
          disabled={loading}
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
};
