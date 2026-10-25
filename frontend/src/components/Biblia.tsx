
import React, { useEffect, useState } from 'react';

interface LivroArray {
  abbrev: string;
  name?: string;
  chapters: string[][];
}

interface BibliaProps {
  onSair: () => void;
}

const TAMANHO_TEXTO_MINIMO = 14;
const TAMANHO_TEXTO_MAXIMO = 30;
const INCREMENTO_TEXTO = 2;

const Biblia: React.FC<BibliaProps> = ({ onSair }) => {
  const [biblia, setBiblia] = useState<LivroArray[] | null>(null);
  const [livroSelecionado, setLivroSelecionado] = useState<number | null>(null);
  const [capituloSelecionado, setCapituloSelecionado] = useState<number | null>(null);
  const [versiculoSelecionado, setVersiculoSelecionado] = useState<number | null>(null);
  const [tamanhoTexto, setTamanhoTexto] = useState(18);

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
    const testamentos = [
      { titulo: 'Antigo Testamento', livros: biblia.slice(0, 39), inicio: 0 },
      { titulo: 'Novo Testamento', livros: biblia.slice(39), inicio: 39 },
    ];

    return (
      <main className="bible-books-screen" style={{
        minHeight: '100vh',
        boxSizing: 'border-box',
        padding: '24px clamp(16px, 4vw, 40px)',
        background: '#f4f5fb',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <header style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 24,
          }}>
            <h2 className="bible-books-title" style={{ color: '#4e54c8', fontSize: 28, margin: 0 }}>Livros da Bíblia</h2>
            <button
              className="bible-exit-button"
              onClick={onSair}
              style={{
                background: '#eee',
                color: '#4e54c8',
                border: 'none',
                borderRadius: 8,
                padding: '10px 18px',
                fontWeight: 600,
                fontSize: 16,
                cursor: 'pointer',
              }}
            >
              Sair
            </button>
          </header>
        {(!biblia || biblia.length === 0) && (
          <div style={{color: 'red', margin: '1em 0'}}>
            Nenhum livro encontrado.<br/>
            <pre style={{background: '#eee', padding: '1em', overflowX: 'auto'}}>{JSON.stringify(biblia, null, 2)}</pre>
          </div>
        )}
          {testamentos.map(testamento => (
            <section
              key={testamento.titulo}
              aria-labelledby={`titulo-${testamento.titulo.replaceAll(' ', '-').toLowerCase()}`}
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: '20px clamp(14px, 3vw, 28px)',
                marginBottom: 20,
                boxShadow: '0 2px 8px #0001',
              }}
            >
              <h3
                className="bible-testament-title"
                id={`titulo-${testamento.titulo.replaceAll(' ', '-').toLowerCase()}`}
                style={{
                  color: '#4e54c8',
                  fontSize: 22,
                  margin: '0 0 16px',
                  paddingBottom: 10,
                  borderBottom: '2px solid #e7e8f8',
                }}
              >
                {testamento.titulo}
              </h3>
              <div className="bible-books-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))',
                gap: 10,
              }}>
                {testamento.livros.map((livro, idx) => (
                  <button
                    className="bible-book-button"
                    key={livro.abbrev}
                    type="button"
                    onClick={() => setLivroSelecionado(testamento.inicio + idx)}
                    style={{
                      minHeight: 52,
                      padding: '10px 14px',
                      border: '1px solid #d9daf5',
                      borderRadius: 8,
                      background: '#f8f8ff',
                      color: '#343a8a',
                      fontSize: 17,
                      fontWeight: 600,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    {livro.name || livro.abbrev}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    );
  }


  const livro = biblia[livroSelecionado];
  if (!livro || !livro.chapters) {
    return <div>Livro não encontrado ou sem capítulos.</div>;
  }

  // Lista de capítulos
  if (capituloSelecionado === null) {
    return (
      <main className="bible-navigation-screen">
        <button className="bible-back-button" type="button" onClick={() => setLivroSelecionado(null)}>Voltar</button>
        <h2 className="bible-navigation-title">{livro.name || livro.abbrev}</h2>
        <div className="bible-navigation-grid">
          {livro.chapters.length === 0 ? (
            <p>Nenhum capítulo encontrado.</p>
          ) : (
            livro.chapters.map((_, idx) => (
              <button
                className="bible-navigation-button"
                key={idx}
                type="button"
                onClick={() => setCapituloSelecionado(idx)}
              >
                Capítulo {idx + 1}
              </button>
            ))
          )}
        </div>
      </main>
    );
  }

  const capitulo = livro.chapters[capituloSelecionado];
  if (!capitulo || !Array.isArray(capitulo)) {
    return <div>Capítulo não encontrado.</div>;
  }

  // Lista de versículos
  if (versiculoSelecionado === null) {
    return (
      <main className="bible-navigation-screen">
        <button className="bible-back-button" type="button" onClick={() => setCapituloSelecionado(null)}>Voltar</button>
        <h2 className="bible-navigation-title">{livro.name || livro.abbrev} - Capítulo {capituloSelecionado + 1}</h2>
        <div className="bible-navigation-grid">
          {capitulo.length === 0 ? (
            <p>Nenhum versículo encontrado.</p>
          ) : (
            capitulo.map((_, idx) => (
              <button
                className="bible-navigation-button"
                key={idx}
                type="button"
                onClick={() => setVersiculoSelecionado(idx)}
              >
                Versículo {idx + 1}
              </button>
            ))
          )}
        </div>
      </main>
    );
  }

  // Exibir o capítulo inteiro, destacando o versículo selecionado
  return (
    <main className="bible-reading-screen">
      <button className="bible-back-button" type="button" onClick={() => setVersiculoSelecionado(null)}>Voltar</button>
      <h2 className="bible-reading-title">{livro.name || livro.abbrev} - Capítulo {capituloSelecionado + 1}</h2>
      <div className="bible-text-size-controls" role="group" aria-label="Ajustar tamanho do texto bíblico">
        <button
          type="button"
          aria-label="Diminuir tamanho do texto"
          onClick={() => setTamanhoTexto(tamanho => Math.max(TAMANHO_TEXTO_MINIMO, tamanho - INCREMENTO_TEXTO))}
          disabled={tamanhoTexto <= TAMANHO_TEXTO_MINIMO}
        >
          A−
        </button>
        <span aria-live="polite">{tamanhoTexto}px</span>
        <button
          type="button"
          aria-label="Aumentar tamanho do texto"
          onClick={() => setTamanhoTexto(tamanho => Math.min(TAMANHO_TEXTO_MAXIMO, tamanho + INCREMENTO_TEXTO))}
          disabled={tamanhoTexto >= TAMANHO_TEXTO_MAXIMO}
        >
          A+
        </button>
      </div>
      <div className="bible-reading-text">
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {capitulo.map((vers, idx) => (
            <li key={idx} style={{
              background: idx === versiculoSelecionado ? '#ffe066' : 'transparent',
              fontWeight: idx === versiculoSelecionado ? 'bold' : 'normal',
              borderRadius: '4px',
              padding: '0.3em 0.5em',
              marginBottom: '0.2em',
              transition: 'background 0.2s',
              fontSize: `${tamanhoTexto}px`,
            }}>
              <span style={{ color: '#888', marginRight: 8 }}>{idx + 1}</span>
              {vers}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
};

export default Biblia;
