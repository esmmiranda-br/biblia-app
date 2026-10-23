
import React, { useEffect, useState } from 'react';

interface LivroArray {
  abbrev: string;
  name?: string;
  chapters: string[][];
}

interface BibliaProps {
  onSair: () => void;
}

const Biblia: React.FC<BibliaProps> = ({ onSair }) => {
  const [biblia, setBiblia] = useState<LivroArray[] | null>(null);
  const [livroSelecionado, setLivroSelecionado] = useState<number | null>(null);
  const [capituloSelecionado, setCapituloSelecionado] = useState<number | null>(null);
  const [versiculoSelecionado, setVersiculoSelecionado] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/biblia')
      .then(res => res.json())
      .then(data => {
        // Garante que sempre será um array
        if (Array.isArray(data)) {
          setBiblia(data);
        } else if (Array.isArray(data.books)) {
          setBiblia(data.books);
        } else {
          setBiblia([]);
        }
      });
  }, []);

  if (!biblia) return <div>Carregando Bíblia...</div>;

  // Lista de livros
  if (livroSelecionado === null) {
    return (
      <div>
        <h2>Livros da Bíblia</h2>
        <button onClick={onSair} style={{ marginBottom: 16, background: '#eee', color: '#4e54c8', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', fontWeight: 600, cursor: 'pointer' }}>Sair</button>
        {(!biblia || biblia.length === 0) && (
          <div style={{color: 'red', margin: '1em 0'}}>
            Nenhum livro encontrado.<br/>
            <pre style={{background: '#eee', padding: '1em', overflowX: 'auto'}}>{JSON.stringify(biblia, null, 2)}</pre>
          </div>
        )}
        <ul>
          {biblia.map((livro, idx) => (
            <li key={livro.abbrev}>
              <button onClick={() => setLivroSelecionado(idx)}>{livro.name || livro.abbrev}</button>
            </li>
          ))}
        </ul>
      </div>
    );
  }


  const livro = biblia[livroSelecionado];
  if (!livro || !livro.chapters) {
    return <div>Livro não encontrado ou sem capítulos.</div>;
  }

  // Lista de capítulos
  if (capituloSelecionado === null) {
    return (
      <div>
        <button onClick={() => setLivroSelecionado(null)}>Voltar</button>
        <h2>{livro.name || livro.abbrev}</h2>
        <ul>
          {livro.chapters.length === 0 ? (
            <li>Nenhum capítulo encontrado.</li>
          ) : (
            livro.chapters.map((cap, idx) => (
              <li key={idx}>
                <button onClick={() => setCapituloSelecionado(idx)}>
                  Capítulo {idx + 1}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    );
  }

  const capitulo = livro.chapters[capituloSelecionado];
  if (!capitulo || !Array.isArray(capitulo)) {
    return <div>Capítulo não encontrado.</div>;
  }

  // Lista de versículos
  if (versiculoSelecionado === null) {
    return (
      <div>
        <button onClick={() => setCapituloSelecionado(null)}>Voltar</button>
        <h2>{livro.name || livro.abbrev} - Capítulo {capituloSelecionado + 1}</h2>
        <ul>
          {capitulo.length === 0 ? (
            <li>Nenhum versículo encontrado.</li>
          ) : (
            capitulo.map((vers, idx) => (
              <li key={idx}>
                <button onClick={() => setVersiculoSelecionado(idx)}>
                  Versículo {idx + 1}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    );
  }

  // Exibir o capítulo inteiro, destacando o versículo selecionado
  return (
    <div>
      <button onClick={() => setVersiculoSelecionado(null)}>Voltar</button>
      <h2>{livro.name || livro.abbrev} - Capítulo {capituloSelecionado + 1}</h2>
      <div style={{ margin: '1em 0' }}>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {capitulo.map((vers, idx) => (
            <li key={idx} style={{
              background: idx === versiculoSelecionado ? '#ffe066' : 'transparent',
              fontWeight: idx === versiculoSelecionado ? 'bold' : 'normal',
              borderRadius: '4px',
              padding: '0.3em 0.5em',
              marginBottom: '0.2em',
              transition: 'background 0.2s'
            }}>
              <span style={{ color: '#888', marginRight: 8 }}>{idx + 1}</span>
              {vers}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Biblia;
