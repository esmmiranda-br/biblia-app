import React, { useEffect, useState } from 'react';
import { BibliaPopup } from './BibliaPopup';

interface Estudo {
  id: number;
  titulo: string;
  tema: string;
  conteudo: string;
  dataHora: string;
  usuario: string;
  compartilhado: boolean;
}

interface EstudosProps {
  usuario: string;
  perfil: string;
  onSair: () => void;
}

export const Estudos: React.FC<EstudosProps> = ({ usuario, perfil, onSair }) => {
  // Função para imprimir apenas o conteúdo do estudo
  function imprimirEstudo(estudo: Estudo) {
    const printWindow = window.open('', '', 'width=800,height=600');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
      <head>
        <title>Imprimir Estudo</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 32px; }
          h2 { color: #4e54c8; }
          .tema { color: #4e54c8; font-weight: 500; margin-bottom: 8px; }
          .conteudo { white-space: pre-wrap; margin-bottom: 16px; }
          .info { font-size: 12px; color: #888; }
          .author { color: #4e54c8; font-size: 15px; font-weight: 700; }
        </style>
      </head>
      <body>
        <h2>${estudo.titulo}</h2>
        <div class="tema">Tema: ${estudo.tema}</div>
        <div class="conteudo">${estudo.conteudo.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
        <div class="info">Criado em: ${new Date(estudo.dataHora).toLocaleString()}</div>
        <div class="author">Criado por: ${estudo.usuario}</div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  }
  const [estudos, setEstudos] = useState<Estudo[]>([]);
  const [editando, setEditando] = useState<Estudo | null>(null);
  const [visualizando, setVisualizando] = useState<Estudo | null>(null);
  const [popupRef, setPopupRef] = useState<string | null>(null);
  const [tamanhoFonte, setTamanhoFonte] = useState(20);
  const [novo, setNovo] = useState({ titulo: '', tema: '', conteudo: '', compartilhado: false });
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filtroTitulo, setFiltroTitulo] = useState('');
  const [filtroTema, setFiltroTema] = useState('');

  const parseConteudo = (texto: string) => {
    const refRegex = /([1-3]?\s?[A-Za-zÀ-ÿçÇãõéíúâêô\- ]+)\s*(\d+):(\d+)(?:-(\d+))?/gi;
    const partes: (string | React.ReactNode)[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = refRegex.exec(texto)) !== null) {
      const ref = match[0];
      const idx = match.index;
      if (idx > lastIdx) partes.push(texto.slice(lastIdx, idx));
      partes.push(
        <button
          key={idx}
          type="button"
          className="scripture-reference"
          aria-label={`Abrir referência bíblica ${ref}`}
          onClick={() => setPopupRef(ref)}
        >
          {ref}
        </button>
      );
      lastIdx = idx + ref.length;
    }

    if (lastIdx < texto.length) partes.push(texto.slice(lastIdx));
    return partes;
  };

  const fetchEstudos = async () => {
    setLoading(true);
    setErro(null);
    try {
      const resp = await fetch('/api/estudos', {
        headers: {
          'x-usuario': usuario,
          'x-perfil': perfil,
        },
      });
      const data = await resp.json();
      setEstudos(Array.isArray(data) ? data : []);
    } catch (e) {
      setErro('Erro ao buscar estudos.');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEstudos();
    // eslint-disable-next-line
  }, []);

  const handleSalvar = async () => {
    setErro(null);
    if (!novo.titulo || !novo.tema || !novo.conteudo) {
      setErro('Preencha todos os campos.');
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch('/api/estudos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-usuario': usuario,
          'x-perfil': perfil,
        },
        body: JSON.stringify(novo),
      });
      if (!resp.ok) throw new Error('Erro ao salvar.');
      setNovo({ titulo: '', tema: '', conteudo: '', compartilhado: false });
      fetchEstudos();
    } catch (e) {
      setErro('Erro ao salvar.');
    }
    setLoading(false);
  };

  const handleEditar = (estudo: Estudo) => {
    setEditando(estudo);
  };

  const handleSalvarEdicao = async () => {
    if (!editando) return;
    setErro(null);
    if (!editando.titulo || !editando.tema || !editando.conteudo) {
      setErro('Preencha todos os campos.');
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch(`/api/estudos/${editando.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-usuario': usuario,
          'x-perfil': perfil,
        },
        body: JSON.stringify(editando),
      });
      if (!resp.ok) throw new Error('Erro ao editar.');
      setEditando(null);
      fetchEstudos();
    } catch (e) {
      setErro('Erro ao editar.');
    }
    setLoading(false);
  };

  const handleExcluir = async (id: number) => {
    if (!window.confirm('Excluir este estudo?')) return;
    setLoading(true);
    try {
      await fetch(`/api/estudos/${id}`, {
        method: 'DELETE',
        headers: {
          'x-usuario': usuario,
          'x-perfil': perfil,
        },
      });
      fetchEstudos();
    } catch (e) {
      setErro('Erro ao excluir.');
    }
    setLoading(false);
  };

  return (
    <div className="studies-screen" style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <div className="studies-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: '#4e54c8', margin: 0 }}>Estudos Bíblicos</h2>
        <button type="button" className="studies-exit-button" onClick={onSair} style={{ background: '#eee', color: '#4e54c8', border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 600, fontSize: 16, marginLeft: 16 }}>Sair</button>
      </div>
      {erro && <div className="studies-error" style={{ color: 'red', marginBottom: 8 }} role="alert">{erro}</div>}
      {loading && <div className="studies-loading">Carregando...</div>}
      <div className="studies-editor-card" style={{ background: '#f7f7fa', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h3>Novo Estudo</h3>
        <input
          placeholder="Título"
          value={novo.titulo}
          onChange={e => setNovo({ ...novo, titulo: e.target.value })}
          style={{ width: '100%', marginBottom: 8 }}
        />
        <input
          placeholder="Tema (ex: fé, amor, oração)"
          value={novo.tema}
          onChange={e => setNovo({ ...novo, tema: e.target.value })}
          style={{ width: '100%', marginBottom: 8 }}
        />
        <textarea
          placeholder="Conteúdo do estudo"
          value={novo.conteudo}
          onChange={e => setNovo({ ...novo, conteudo: e.target.value })}
          style={{ width: '100%', minHeight: 80, marginBottom: 8 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={novo.compartilhado}
            onChange={e => setNovo({ ...novo, compartilhado: e.target.checked })}
          />
          Permitir que outros usuários consultem este estudo
        </label>
        <button onClick={handleSalvar} style={{ background: '#4e54c8', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600 }}>
          Salvar
        </button>
      </div>
      <section className="studies-list-section">
        <h3 className="studies-section-title">Lista de Estudos</h3>
        <div className="studies-filters" style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input
          placeholder="Filtrar por título"
          value={filtroTitulo}
          onChange={e => setFiltroTitulo(e.target.value)}
          style={{ flex: 1, padding: 6, borderRadius: 6, border: '1px solid #ccc' }}
        />
        <input
          placeholder="Filtrar por tema"
          value={filtroTema}
          onChange={e => setFiltroTema(e.target.value)}
          style={{ flex: 1, padding: 6, borderRadius: 6, border: '1px solid #ccc' }}
        />
      </div>
      {estudos.filter(estudo =>
        estudo.titulo.toLowerCase().includes(filtroTitulo.toLowerCase()) &&
        estudo.tema.toLowerCase().includes(filtroTema.toLowerCase())
      ).length === 0 && <div className="studies-empty-state">Nenhum estudo cadastrado.</div>}
      {estudos.filter(estudo =>
        estudo.titulo.toLowerCase().includes(filtroTitulo.toLowerCase()) &&
        estudo.tema.toLowerCase().includes(filtroTema.toLowerCase())
      ).map(estudo => (
        <div key={estudo.id} className="study-card" style={{ background: '#fff', borderRadius: 8, padding: 16, marginBottom: 16, boxShadow: '0 2px 8px #0001' }}>
          {editando && editando.id === estudo.id ? (
            <div>
              <input
                value={editando.titulo}
                onChange={e => setEditando({ ...editando, titulo: e.target.value })}
                style={{ width: '100%', marginBottom: 8 }}
              />
              <input
                value={editando.tema}
                onChange={e => setEditando({ ...editando, tema: e.target.value })}
                style={{ width: '100%', marginBottom: 8 }}
              />
              <textarea
                value={editando.conteudo}
                onChange={e => setEditando({ ...editando, conteudo: e.target.value })}
                style={{ width: '100%', minHeight: 80, marginBottom: 8 }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={editando.compartilhado}
                  onChange={e => setEditando({ ...editando, compartilhado: e.target.checked })}
                />
                Permitir que outros usuários consultem este estudo
              </label>
              <button onClick={handleSalvarEdicao} style={{ background: '#4e54c8', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, marginRight: 8 }}>
                Salvar
              </button>
              <button onClick={() => setEditando(null)} style={{ background: '#eee', color: '#4e54c8', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600 }}>
                Cancelar
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontWeight: 600, fontSize: 18 }}>{estudo.titulo}</div>
              <div style={{ color: '#4e54c8', fontWeight: 500 }}>Tema: {estudo.tema}</div>
              <div style={{ whiteSpace: 'pre-wrap', margin: '8px 0', maxHeight: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>{estudo.conteudo.length > 120 ? estudo.conteudo.slice(0, 120) + '...' : estudo.conteudo}</div>
              <div style={{ fontSize: 12, color: '#888' }}>Criado em: {new Date(estudo.dataHora).toLocaleString()}</div>
              <div style={{ color: '#4e54c8', fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Criado por: {estudo.usuario}</div>
              <button onClick={() => { setTamanhoFonte(20); setVisualizando(estudo); }} style={{ background: '#4e54c8', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 12px', fontWeight: 600, marginRight: 8 }}>
                Consultar
              </button>
              <button onClick={() => imprimirEstudo(estudo)} style={{ background: '#eee', color: '#4e54c8', border: 'none', borderRadius: 8, padding: '4px 12px', fontWeight: 600, marginRight: 8 }}>
                Imprimir
              </button>
              {(perfil === 'admin' || estudo.usuario === usuario) && (
                <>
                  <button onClick={() => handleEditar(estudo)} style={{ background: '#eee', color: '#4e54c8', border: 'none', borderRadius: 8, padding: '4px 12px', fontWeight: 600, marginRight: 8 }}>
                    Editar
                  </button>
                  <button onClick={() => handleExcluir(estudo.id)} style={{ background: '#eee', color: 'red', border: 'none', borderRadius: 8, padding: '4px 12px', fontWeight: 600 }}>
                    Excluir
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        ))}
      </section>

      {/* Modal de visualização */}
      {visualizando && (
        <div className="studies-view-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="studies-view-dialog" role="dialog" aria-modal="true" aria-labelledby="study-view-title" style={{ background: '#fff', borderRadius: 12, padding: 0, maxWidth: 600, width: '95%', maxHeight: '90vh', boxShadow: '0 4px 24px #0003', position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <div className="studies-view-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', padding: 12 }}>
              <button onClick={() => setVisualizando(null)} style={{ background: '#eee', border: 'none', borderRadius: 8, padding: '6px 18px', color: '#4e54c8', fontWeight: 600, fontSize: 16 }}>Sair</button>
              <button onClick={() => imprimirEstudo(visualizando)} style={{ background: '#4e54c8', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 18px', fontWeight: 600, fontSize: 16 }}>Imprimir</button>
            </div>
            <div id="estudo-print" className="studies-view-content" style={{ overflowY: 'auto', padding: 32, flex: 1 }}>
              <h2 id="study-view-title" style={{ color: '#4e54c8', marginBottom: 8 }}>{visualizando.titulo}</h2>
              <div style={{ color: '#4e54c8', fontWeight: 500, marginBottom: 8 }}>Tema: {visualizando.tema}</div>
              <div className="studies-font-controls" role="group" aria-label="Ajustar tamanho do texto do estudo">
                <button
                  type="button"
                  aria-label="Diminuir tamanho da letra"
                  onClick={() => setTamanhoFonte(fonte => Math.max(12, fonte - 2))}
                  disabled={tamanhoFonte <= 12}
                >
                  A-
                </button>
                <span aria-live="polite">{tamanhoFonte}px</span>
                <button
                  type="button"
                  aria-label="Aumentar tamanho da letra"
                  onClick={() => setTamanhoFonte(fonte => Math.min(48, fonte + 2))}
                  disabled={tamanhoFonte >= 48}
                >
                  A+
                </button>
              </div>
              <div className="studies-reading-text" style={{ whiteSpace: 'pre-wrap', marginBottom: 16, fontSize: `${tamanhoFonte}px` }}>{parseConteudo(visualizando.conteudo)}</div>
              <div style={{ fontSize: 12, color: '#888' }}>Criado em: {new Date(visualizando.dataHora).toLocaleString()}</div>
              <div style={{ color: '#4e54c8', fontSize: 15, fontWeight: 700 }}>Criado por: {visualizando.usuario}</div>
            </div>
          </div>
        </div>
      )}
      {popupRef && <BibliaPopup referencia={popupRef} onClose={() => setPopupRef(null)} />}

    </div>
  );
};
