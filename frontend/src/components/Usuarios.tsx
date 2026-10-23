import React, { useEffect, useState } from 'react';

// Função utilitária para gerar senha provisória
function gerarSenhaProvisoria(tamanho = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let senha = '';
  for (let i = 0; i < tamanho; i++) {
    senha += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return senha;
}


interface Usuario {
  id: number;
  usuario: string;
  perfil: 'read' | 'edit' | 'admin';
}

const perfis = [
  { value: 'read', label: 'Read (Visualizar)' },
  { value: 'edit', label: 'Edit (Alterar)' },
  { value: 'admin', label: 'Admin (Total)' },
];

const initialForm = { usuario: '', senha: '', perfil: 'read' as 'read' };


interface UsuariosProps {
  usuario: { id: number; usuario: string; perfil: string };
  onSair: () => void;
}


export const Usuarios: React.FC<UsuariosProps> = ({ usuario, onSair }) => {
  const usuarioLogado = usuario.usuario;
  const perfil = usuario.perfil;
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [form, setForm] = useState<{ usuario: string; senha: string; perfil: 'read' | 'edit' | 'admin' }>(initialForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(true);

  // Estado para alterar senha própria
  const [showSenha, setShowSenha] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [msgSenha, setMsgSenha] = useState('');

  // Estado para reset de senha admin
  const [resetInfo, setResetInfo] = useState<{ usuario: string, senha: string } | null>(null);

  useEffect(() => {
    fetch('/api/usuarios', {
      headers: {
        'x-usuario': usuarioLogado,
        'x-perfil': perfil,
      },
    })
      .then(res => res.json())
      .then(data => { setUsuarios(data); setLoading(false); });
  }, [usuarioLogado, perfil]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    if (!form.usuario || (!editId && !form.senha)) {
      setErro('Preencha todos os campos.');
      return;
    }
    if (perfil !== 'admin') {
      setErro('Apenas administradores podem criar ou editar usuários.');
      return;
    }
    if (editId) {
      // Editar (não altera senha)
      const res = await fetch(`/api/usuarios/${editId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-usuario': usuarioLogado,
          'x-perfil': perfil,
        },
        body: JSON.stringify({ usuario: form.usuario, perfil: form.perfil }),
      });
      if (res.ok) {
        const atualizado = await res.json();
        setUsuarios(usuarios.map(u => u.id === editId ? atualizado : u));
        setEditId(null);
        setForm(initialForm);
      } else {
        setErro('Erro ao editar usuário.');
      }
    } else {
      // Criar
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-usuario': usuarioLogado,
          'x-perfil': perfil,
        },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const novo = await res.json();
        setUsuarios([...usuarios, novo]);
        setForm(initialForm);
      } else {
        setErro('Usuário já existe ou erro ao criar.');
      }
    }
  };

  const handleEdit = (u: Usuario) => {
    setForm({ usuario: u.usuario, senha: '', perfil: u.perfil });
    setEditId(u.id);
    setErro('');
  };

  const handleDelete = async (id: number) => {
    if (perfil !== 'admin') return;
    if (!window.confirm('Excluir este usuário?')) return;
    const res = await fetch(`/api/usuarios/${id}`, {
      method: 'DELETE',
      headers: {
        'x-usuario': usuarioLogado,
        'x-perfil': perfil,
      },
    });
    if (res.ok) setUsuarios(usuarios.filter(u => u.id !== id));
  };

  // Função para alterar a própria senha
  const handleAlterarSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsgSenha('');
    if (!senhaAtual || !novaSenha) {
      setMsgSenha('Preencha todos os campos.');
      return;
    }
    try {
      const res = await fetch('/api/usuarios/alterar-senha', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-usuario': usuarioLogado,
          'x-perfil': perfil,
        },
        body: JSON.stringify({ senhaAtual, novaSenha }),
      });
      if (res.ok) {
        setMsgSenha('Senha alterada com sucesso!');
        setSenhaAtual('');
        setNovaSenha('');
        setShowSenha(false);
      } else {
        let erroMsg = 'Erro ao alterar senha.';
        try {
          const erro = await res.json();
          erroMsg = erro.erro || erroMsg;
        } catch {}
        setMsgSenha(erroMsg);
      }
    } catch (e) {
      setMsgSenha('Erro de conexão com o servidor.');
    }
  };

  // Função para admin resetar senha de outro usuário
  const handleResetSenha = async (usuarioAlvo: string) => {
    const senha = gerarSenhaProvisoria();
    const res = await fetch('/api/usuarios/resetar-senha', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-usuario': usuarioLogado,
        'x-perfil': perfil,
      },
      body: JSON.stringify({ usuarioAlvo, novaSenha: senha }),
    });
    if (res.ok) {
      setResetInfo({ usuario: usuarioAlvo, senha });
    } else {
      setResetInfo(null);
      alert('Erro ao resetar senha.');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #4e54c8 0%, #8f94fb 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '2rem 0',
    }}>
      <>
        {/* Botão para alterar a própria senha */}
        <div style={{ marginBottom: 24 }}>
          <button style={{ ...btnStyle, background: '#8f94fb', color: '#fff', fontSize: 15 }} onClick={() => setShowSenha(s => !s)}>
            {showSenha ? 'Fechar' : 'Alterar minha senha'}
          </button>
          {showSenha && (
            <form onSubmit={handleAlterarSenha} style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, background: '#fff', padding: 16, borderRadius: 8, boxShadow: '0 2px 8px #0001', maxWidth: 350 }}>
              <input type="password" placeholder="Senha atual" value={senhaAtual} onChange={e => setSenhaAtual(e.target.value)} style={inputStyle} />
              <input type="password" placeholder="Nova senha" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} style={inputStyle} />
              <button type="submit" style={btnStyle}>Salvar nova senha</button>
              {msgSenha && <div style={{ color: msgSenha.includes('sucesso') ? 'green' : 'red', textAlign: 'center' }}>{msgSenha}</div>}
            </form>
          )}
        </div>

        <div style={{
          background: '#fff',
          padding: '2rem',
          borderRadius: 16,
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
          minWidth: 320,
          maxWidth: 600,
          width: '100%',
          marginBottom: '2rem',
          display: perfil === 'admin' ? undefined : 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>
          {perfil === 'admin' ? (
            <>
              <h2 style={{ color: '#4e54c8', margin: 0, textAlign: 'center' }}>{editId ? 'Editar Usuário' : 'Cadastrar Usuário'}</h2>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: 16 }}>
                <input
                  name="usuario"
                  placeholder="Usuário"
                  value={form.usuario}
                  onChange={handleChange}
                  style={inputStyle}
                  autoComplete="off"
                />
                {!editId && (
                  <input
                    name="senha"
                    type="password"
                    placeholder="Senha"
                    value={form.senha}
                    onChange={handleChange}
                    style={inputStyle}
                    autoComplete="new-password"
                  />
                )}
                <select name="perfil" value={form.perfil} onChange={handleChange} style={inputStyle}>
                  {perfis.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                {erro && <div style={{ color: 'red', textAlign: 'center' }}>{erro}</div>}
                <button type="submit" style={btnStyle}>{editId ? 'Salvar Alterações' : 'Cadastrar'}</button>
                {editId !== null && (
                  <button type="button" style={{ ...btnStyle, background: '#eee', color: '#4e54c8' }} onClick={() => { setForm(initialForm); setEditId(null); }}>Cancelar</button>
                )}
                <button type="button" style={{ ...btnStyle, background: '#eee', color: '#4e54c8' }} onClick={onSair}>Sair</button>
              </form>
            </>
          ) : (
            <button type="button" style={{ ...btnStyle, background: '#eee', color: '#4e54c8', marginTop: 16 }} onClick={onSair}>Sair</button>
          )}
        </div>
        <div style={{ width: '100%', maxWidth: 600 }}>
          {loading ? (
            <div style={{ color: '#fff', textAlign: 'center' }}>Carregando...</div>
          ) : usuarios.length === 0 ? (
            <div style={{ color: '#fff', textAlign: 'center' }}>Nenhum usuário cadastrado.</div>
          ) : (
            <table style={{ width: '100%', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
              <thead>
                <tr style={{ background: '#4e54c8', color: '#fff' }}>
                  <th style={thTdStyle}>Usuário</th>
                  <th style={thTdStyle}>Perfil</th>
                  <th style={thTdStyle}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map(u => (
                  <tr key={u.id}>
                    <td style={thTdStyle}>{u.usuario}</td>
                    <td style={thTdStyle}>{perfis.find(p => p.value === u.perfil)?.label}</td>
                    <td style={thTdStyle}>
                      <button style={{ ...btnStyle, padding: '0.25rem 0.75rem', fontSize: 14, marginRight: 8 }} onClick={() => handleEdit(u)}>Editar</button>
                      <button style={{ ...btnStyle, background: '#eee', color: '#4e54c8', padding: '0.25rem 0.75rem', fontSize: 14, marginRight: 8 }} onClick={() => handleDelete(u.id)}>Excluir</button>
                      {perfil === 'admin' && u.usuario !== usuarioLogado && (
                        <button style={{ ...btnStyle, background: '#f7b731', color: '#222', padding: '0.25rem 0.75rem', fontSize: 14 }} onClick={() => handleResetSenha(u.usuario)}>Resetar senha</button>
                      )}
                            {/* Exibir senha provisória gerada pelo admin */}
                            {resetInfo && (
                              <div style={{ marginTop: 16, background: '#fffbe6', color: '#222', border: '1px solid #f7b731', borderRadius: 8, padding: 12, maxWidth: 350 }}>
                                Senha provisória para <b>{resetInfo.usuario}</b>: <span style={{ fontWeight: 600 }}>{resetInfo.senha}</span>
                                <button style={{ marginLeft: 16, ...btnStyle, background: '#eee', color: '#4e54c8', fontSize: 13, padding: '0.2rem 0.7rem' }} onClick={() => setResetInfo(null)}>Fechar</button>
                              </div>
                            )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  padding: '0.75rem',
  borderRadius: 8,
  border: '1px solid #ccc',
  fontSize: 16,
};

const btnStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #4e54c8 0%, #8f94fb 100%)',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '0.75rem',
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background 0.2s',
};

const thTdStyle: React.CSSProperties = {
  padding: '0.5rem',
  textAlign: 'left',
};
