
import React, { useState, useEffect } from 'react';
import { SermaoConsulta } from './SermaoConsulta';


interface Sermao {
  id: number;
  nome: string;
  conteudo: string;
  dataHora: string;
  local: string;
  usuario?: string;
}

const initialForm = { nome: '', conteudo: '', dataHora: '', local: '' };


interface SermoesProps {
  usuario: { id: number; usuario: string; perfil: string };
  onSair: () => void;
}


export const Sermoes: React.FC<SermoesProps> = ({ usuario, onSair }) => {
  const usuarioLogado = usuario.usuario;
  const perfil = usuario.perfil;
  const [sermoes, setSermoes] = useState<Sermao[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Omit<Sermao, 'id'>>({ ...initialForm });
  const [editId, setEditId] = useState<number | null>(null);
  const [consulta, setConsulta] = useState<Sermao | null>(null);

  // Carregar sermões do backend ao montar
  useEffect(() => {
    fetch('/api/sermoes', {
      headers: {
        'x-usuario': usuarioLogado,
        'x-perfil': perfil,
      },
    })
      .then(res => res.json())
      .then(data => {
        setSermoes(data);
        setLoading(false);
      });
  }, [usuarioLogado, perfil]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome || !form.conteudo || !form.dataHora || !form.local) return;
    if (perfil === 'read') return;
    if (editId !== null) {
      // Editar
      const res = await fetch(`/api/sermoes/${editId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-usuario': usuarioLogado,
          'x-perfil': perfil,
        },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const atualizado = await res.json();
        setSermoes(sermoes.map(s => s.id === editId ? atualizado : s));
        setEditId(null);
        setForm({ ...initialForm });
      }
    } else {
      // Criar
      const res = await fetch('/api/sermoes', {
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
        setSermoes([...sermoes, novo]);
        setForm({ ...initialForm });
      }
    }
  };

  const handleEdit = (id: number) => {
    const s = sermoes.find(s => s.id === id);
    if (s) {
      setForm({ nome: s.nome, conteudo: s.conteudo, dataHora: s.dataHora, local: s.local });
      setEditId(id);
    }
  };

  const handleDelete = async (id: number) => {
    if (perfil === 'read') return;
    const res = await fetch(`/api/sermoes/${id}`, {
      method: 'DELETE',
      headers: {
        'x-usuario': usuarioLogado,
        'x-perfil': perfil,
      },
    });
    if (res.ok) {
      setSermoes(sermoes.filter(s => s.id !== id));
      if (editId === id) {
        setForm({ ...initialForm });
        setEditId(null);
      }
    }
  };

  if (consulta) {
    return <SermaoConsulta nome={consulta.nome} conteudo={consulta.conteudo} onClose={() => setConsulta(null)} />;
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #4e54c8 0%, #8f94fb 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '2rem 0',
    }}>
      <div style={{
        background: '#fff',
        padding: '2rem',
        borderRadius: 16,
        boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
        minWidth: 320,
        maxWidth: 600,
        width: '100%',
        marginBottom: '2rem',
        display: (perfil === 'admin' || perfil === 'edit') ? undefined : 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        {(perfil === 'admin' || perfil === 'edit') ? (
          <>
            <h2 style={{ color: '#4e54c8', margin: 0, textAlign: 'center' }}>{editId ? 'Editar Sermão' : 'Cadastrar Sermão'}</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: 16 }}>
              <input
                name="nome"
                placeholder="Nome do Sermão"
                value={form.nome}
                onChange={handleChange}
                style={inputStyle}
              />
              <textarea
                name="conteudo"
                placeholder="Conteúdo do Sermão"
                value={form.conteudo}
                onChange={handleChange}
                style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
              />
              <input
                name="dataHora"
                type="datetime-local"
                value={form.dataHora}
                onChange={handleChange}
                style={inputStyle}
              />
              <input
                name="local"
                placeholder="Local do Sermão"
                value={form.local}
                onChange={handleChange}
                style={inputStyle}
              />
              <button type="submit" style={btnStyle}>{editId ? 'Salvar Alterações' : 'Cadastrar'}</button>
              {editId !== null && (
                <button type="button" style={{ ...btnStyle, background: '#eee', color: '#4e54c8' }} onClick={() => { setForm({ ...initialForm }); setEditId(null); }}>Cancelar</button>
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
        ) : sermoes.length === 0 ? (
          <div style={{ color: '#fff', textAlign: 'center' }}>Nenhum sermão cadastrado.</div>
        ) : (
          <table style={{ width: '100%', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            <thead>
              <tr style={{ background: '#4e54c8', color: '#fff' }}>
                <th style={thTdStyle}>Nome</th>
                <th style={thTdStyle}>Data/Hora</th>
                <th style={thTdStyle}>Local</th>
                <th style={thTdStyle}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {sermoes.map(s => (
                <tr key={s.id}>
                  <td style={thTdStyle}>{s.nome}</td>
                  <td style={thTdStyle}>{new Date(s.dataHora).toLocaleString()}</td>
                  <td style={thTdStyle}>{s.local}</td>
                  <td style={thTdStyle}>
                    {(perfil === 'admin' || (perfil === 'edit' && s.usuario === usuarioLogado)) && (
                      <button style={{ ...btnStyle, padding: '0.25rem 0.75rem', fontSize: 14, marginRight: 8 }} onClick={() => handleEdit(s.id)}>Editar</button>
                    )}
                    {(perfil === 'admin' || (perfil === 'edit' && s.usuario === usuarioLogado)) && (
                      <button style={{ ...btnStyle, background: '#eee', color: '#4e54c8', padding: '0.25rem 0.75rem', fontSize: 14, marginRight: 8 }} onClick={() => handleDelete(s.id)}>Excluir</button>
                    )}
                    <button style={{ ...btnStyle, background: '#8f94fb', color: '#fff', padding: '0.25rem 0.75rem', fontSize: 14 }} onClick={() => setConsulta(s)}>Consultar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
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
