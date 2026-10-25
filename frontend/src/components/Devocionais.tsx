import React, { useEffect, useState } from 'react';
import { BibliaPopup } from './BibliaPopup';

interface Devocional {
  id: number;
  titulo: string;
  tema: string;
  conteudo: string;
  dataHora: string;
  usuario: string;
  compartilhado: boolean;
}

interface DevocionaisProps {
  usuario: string;
  perfil: string;
  onSair: () => void;
}

const novoDevocional = { titulo: '', tema: '', conteudo: '', compartilhado: false };

export const Devocionais: React.FC<DevocionaisProps> = ({ usuario, perfil, onSair }) => {
  const [devocionais, setDevocionais] = useState<Devocional[]>([]);
  const [novo, setNovo] = useState({ ...novoDevocional });
  const [editando, setEditando] = useState<Devocional | null>(null);
  const [visualizando, setVisualizando] = useState<Devocional | null>(null);
  const [popupRef, setPopupRef] = useState<string | null>(null);
  const [tamanhoFonte, setTamanhoFonte] = useState(20);
  const [filtroTitulo, setFiltroTitulo] = useState('');
  const [filtroTema, setFiltroTema] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const cabecalhos = {
    'x-usuario': usuario,
    'x-perfil': perfil,
  };

  const carregarDevocionais = async () => {
    setLoading(true);
    setErro(null);
    try {
      const resposta = await fetch('/api/devocionais', { headers: cabecalhos });
      if (!resposta.ok) throw new Error('Não foi possível carregar os devocionais.');
      const dados: unknown = await resposta.json();
      if (!Array.isArray(dados)) throw new Error('A resposta de devocionais é inválida.');
      setDevocionais(dados);
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao buscar devocionais.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void carregarDevocionais();
    // A lista é carregada quando a tela é aberta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const salvarNovo = async () => {
    setErro(null);
    if (!novo.titulo.trim() || !novo.tema.trim() || !novo.conteudo.trim()) {
      setErro('Preencha todos os campos.');
      return;
    }
    setLoading(true);
    try {
      const resposta = await fetch('/api/devocionais', {
        method: 'POST',
        headers: { ...cabecalhos, 'Content-Type': 'application/json' },
        body: JSON.stringify(novo),
      });
      if (!resposta.ok) {
        const resultado = await resposta.json();
        throw new Error(resultado.erro || 'Não foi possível salvar o devocional.');
      }
      setNovo({ ...novoDevocional });
      await carregarDevocionais();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao salvar devocional.');
    } finally {
      setLoading(false);
    }
  };

  const salvarEdicao = async () => {
    if (!editando) return;
    setErro(null);
    if (!editando.titulo.trim() || !editando.tema.trim() || !editando.conteudo.trim()) {
      setErro('Preencha todos os campos.');
      return;
    }
    setLoading(true);
    try {
      const resposta = await fetch(`/api/devocionais/${editando.id}`, {
        method: 'PUT',
        headers: { ...cabecalhos, 'Content-Type': 'application/json' },
        body: JSON.stringify(editando),
      });
      if (!resposta.ok) {
        const resultado = await resposta.json();
        throw new Error(resultado.erro || 'Não foi possível editar o devocional.');
      }
      setEditando(null);
      await carregarDevocionais();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao editar devocional.');
    } finally {
      setLoading(false);
    }
  };

  const excluir = async (id: number) => {
    if (!window.confirm('Excluir este devocional?')) return;
    setErro(null);
    setLoading(true);
    try {
      const resposta = await fetch(`/api/devocionais/${id}`, {
        method: 'DELETE',
        headers: cabecalhos,
      });
      if (!resposta.ok) {
        const resultado = await resposta.json();
        throw new Error(resultado.erro || 'Não foi possível excluir o devocional.');
      }
      await carregarDevocionais();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao excluir devocional.');
    } finally {
      setLoading(false);
    }
  };

  const parseConteudo = (texto: string) => {
    const referenciaRegex = /([1-3]?\s?[A-Za-zÀ-ÿçÇãõéíúâêô\- ]+)\s*(\d+):(\d+)(?:-(\d+))?/gi;
    const partes: (string | React.ReactNode)[] = [];
    let ultimaPosicao = 0;
    let correspondencia: RegExpExecArray | null;

    while ((correspondencia = referenciaRegex.exec(texto)) !== null) {
      const referencia = correspondencia[0];
      if (correspondencia.index > ultimaPosicao) {
        partes.push(texto.slice(ultimaPosicao, correspondencia.index));
      }
      partes.push(
        <button
          key={correspondencia.index}
          type="button"
          className="scripture-reference"
          aria-label={`Abrir referência bíblica ${referencia}`}
          onClick={() => setPopupRef(referencia)}
        >
          {referencia}
        </button>
      );
      ultimaPosicao = correspondencia.index + referencia.length;
    }
    if (ultimaPosicao < texto.length) partes.push(texto.slice(ultimaPosicao));
    return partes;
  };

  const imprimir = (devocional: Devocional) => {
    const janela = window.open('', '', 'width=800,height=600');
    if (!janela) {
      setErro('Permita a abertura de janelas pop-up para imprimir o devocional.');
      return;
    }
    const entidades: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
    };
    const escaparHtml = (texto: string) => texto.replace(/[&<>"]/g, caractere => entidades[caractere] || caractere);
    janela.document.write(`
      <html>
      <head><title>${escaparHtml(devocional.titulo)}</title>
        <style>body{font-family:Arial,sans-serif;padding:32px}h2,.tema,.autor{color:#4e54c8}.conteudo{white-space:pre-wrap;margin-bottom:16px}.info{font-size:12px;color:#888}.autor{font-weight:700}</style>
      </head>
      <body>
        <h2>${escaparHtml(devocional.titulo)}</h2>
        <div class="tema">Tema: ${escaparHtml(devocional.tema)}</div>
        <div class="conteudo">${escaparHtml(devocional.conteudo)}</div>
        <div class="info">Criado em: ${new Date(devocional.dataHora).toLocaleString()}</div>
        <div class="autor">Criado por: ${escaparHtml(devocional.usuario)}</div>
      </body>
      </html>
    `);
    janela.document.close();
    janela.focus();
    janela.print();
    janela.close();
  };

  const filtrados = devocionais.filter(devocional =>
    devocional.titulo.toLowerCase().includes(filtroTitulo.toLowerCase()) &&
    devocional.tema.toLowerCase().includes(filtroTema.toLowerCase())
  );

  const inputStyle: React.CSSProperties = { width: '100%', marginBottom: 8, padding: 8, boxSizing: 'border-box' };
  const botaoStyle: React.CSSProperties = {
    background: '#4e54c8', color: '#fff', border: 'none', borderRadius: 8,
    padding: '6px 12px', fontWeight: 600, cursor: 'pointer', marginRight: 8,
  };

  return (
    <main className="studies-screen" style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <header className="studies-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: '#4e54c8', margin: 0 }}>Devocionais</h2>
        <button type="button" onClick={onSair} style={{ background: '#eee', color: '#4e54c8', border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 600, fontSize: 16 }}>Sair</button>
      </header>
      {erro && <div role="alert" style={{ color: 'red', marginBottom: 8 }}>{erro}</div>}
      {loading && <div role="status" style={{ marginBottom: 8 }}>Carregando...</div>}

      {perfil !== 'read' && (
        <section style={{ background: '#f7f7fa', borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <h3>{editando ? 'Editar Devocional' : 'Novo Devocional'}</h3>
          <input
            placeholder="Título"
            aria-label="Título do devocional"
            value={editando ? editando.titulo : novo.titulo}
            onChange={evento => editando
              ? setEditando({ ...editando, titulo: evento.target.value })
              : setNovo({ ...novo, titulo: evento.target.value })}
            style={inputStyle}
          />
          <input
            placeholder="Tema ou referência bíblica"
            aria-label="Tema ou referência bíblica"
            value={editando ? editando.tema : novo.tema}
            onChange={evento => editando
              ? setEditando({ ...editando, tema: evento.target.value })
              : setNovo({ ...novo, tema: evento.target.value })}
            style={inputStyle}
          />
          <textarea
            placeholder="Conteúdo do devocional"
            aria-label="Conteúdo do devocional"
            value={editando ? editando.conteudo : novo.conteudo}
            onChange={evento => editando
              ? setEditando({ ...editando, conteudo: evento.target.value })
              : setNovo({ ...novo, conteudo: evento.target.value })}
            style={{ ...inputStyle, minHeight: 100 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={editando ? editando.compartilhado : novo.compartilhado}
              onChange={evento => editando
                ? setEditando({ ...editando, compartilhado: evento.target.checked })
                : setNovo({ ...novo, compartilhado: evento.target.checked })}
            />
            Permitir que outros usuários consultem este devocional
          </label>
          <button type="button" onClick={() => void (editando ? salvarEdicao() : salvarNovo())} style={botaoStyle}>
            {editando ? 'Salvar alterações' : 'Salvar'}
          </button>
          {editando && (
            <button type="button" onClick={() => setEditando(null)} style={{ ...botaoStyle, background: '#eee', color: '#4e54c8' }}>
              Cancelar
            </button>
          )}
        </section>
      )}

      <section className="studies-list-section">
        <h3 className="studies-section-title">Lista de Devocionais</h3>
        <div className="studies-filters" style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <input placeholder="Filtrar por título" aria-label="Filtrar devocionais por título" value={filtroTitulo} onChange={evento => setFiltroTitulo(evento.target.value)} style={{ ...inputStyle, flex: 1 }} />
          <input placeholder="Filtrar por tema" aria-label="Filtrar devocionais por tema" value={filtroTema} onChange={evento => setFiltroTema(evento.target.value)} style={{ ...inputStyle, flex: 1 }} />
        </div>
        {filtrados.length === 0 && <div className="studies-empty-state">Nenhum devocional cadastrado.</div>}
        {filtrados.map(devocional => (
          <article key={devocional.id} className="study-card" style={{ background: '#fff', borderRadius: 8, padding: 16, marginBottom: 16, boxShadow: '0 2px 8px #0001' }}>
            <div style={{ fontWeight: 600, fontSize: 18 }}>{devocional.titulo}</div>
            <div style={{ color: '#4e54c8', fontWeight: 500 }}>Tema: {devocional.tema}</div>
            <div style={{ whiteSpace: 'pre-wrap', margin: '8px 0', maxHeight: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {devocional.conteudo.length > 120 ? `${devocional.conteudo.slice(0, 120)}...` : devocional.conteudo}
            </div>
            <div style={{ fontSize: 12, color: '#888' }}>Criado em: {new Date(devocional.dataHora).toLocaleString()}</div>
            <div style={{ color: '#4e54c8', fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Criado por: {devocional.usuario}</div>
            <button type="button" onClick={() => { setTamanhoFonte(20); setVisualizando(devocional); }} style={botaoStyle}>Consultar</button>
            <button type="button" onClick={() => imprimir(devocional)} style={{ ...botaoStyle, background: '#eee', color: '#4e54c8' }}>Imprimir</button>
            {(perfil === 'admin' || devocional.usuario === usuario) && (
              <>
                <button type="button" onClick={() => setEditando(devocional)} style={{ ...botaoStyle, background: '#eee', color: '#4e54c8' }}>Editar</button>
                <button type="button" onClick={() => void excluir(devocional.id)} style={{ ...botaoStyle, background: '#eee', color: 'red' }}>Excluir</button>
              </>
            )}
          </article>
        ))}
      </section>

      {visualizando && (
        <div className="studies-view-overlay" style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <section className="studies-view-dialog" role="dialog" aria-modal="true" aria-labelledby="devocional-view-title" style={{ background: '#fff', borderRadius: 12, padding: 0, maxWidth: 600, width: '95%', maxHeight: '90vh', boxShadow: '0 4px 24px #0003', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', padding: 12 }}>
              <button type="button" onClick={() => setVisualizando(null)} style={{ ...botaoStyle, background: '#eee', color: '#4e54c8' }}>Sair</button>
              <button type="button" onClick={() => imprimir(visualizando)} style={botaoStyle}>Imprimir</button>
            </div>
            <div className="studies-view-content" style={{ overflowY: 'auto', padding: 32, flex: 1 }}>
              <h2 id="devocional-view-title" style={{ color: '#4e54c8', marginBottom: 8 }}>{visualizando.titulo}</h2>
              <div style={{ color: '#4e54c8', fontWeight: 500, marginBottom: 8 }}>Tema: {visualizando.tema}</div>
              <div className="studies-font-controls" role="group" aria-label="Ajustar tamanho do texto do devocional">
                <button type="button" aria-label="Diminuir tamanho da letra" onClick={() => setTamanhoFonte(fonte => Math.max(12, fonte - 2))} disabled={tamanhoFonte <= 12}>A-</button>
                <span aria-live="polite">{tamanhoFonte}px</span>
                <button type="button" aria-label="Aumentar tamanho da letra" onClick={() => setTamanhoFonte(fonte => Math.min(48, fonte + 2))} disabled={tamanhoFonte >= 48}>A+</button>
              </div>
              <div className="studies-reading-text" style={{ whiteSpace: 'pre-wrap', marginBottom: 16, fontSize: `${tamanhoFonte}px` }}>
                {parseConteudo(visualizando.conteudo)}
              </div>
              <div style={{ fontSize: 12, color: '#888' }}>Criado em: {new Date(visualizando.dataHora).toLocaleString()}</div>
              <div style={{ color: '#4e54c8', fontSize: 15, fontWeight: 700 }}>Criado por: {visualizando.usuario}</div>
            </div>
          </section>
        </div>
      )}
      {popupRef && <BibliaPopup referencia={popupRef} onClose={() => setPopupRef(null)} />}
    </main>
  );
};
