import React, { useState, useEffect } from 'react';

interface BibliaPopupProps {
  referencia: string; // Ex: "Jo 3:16", "Gn 1:1", "Lucas 9:57-62"
  onClose: () => void;
}

interface LivroArray {
  abbrev: string;
  name?: string;
  chapters: string[][];
}

export const BibliaPopup: React.FC<BibliaPopupProps> = ({ referencia, onClose }) => {
  const [texto, setTexto] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    // Exemplo de referência: "Lucas 9:57-62", "Gálatas 6:2", "1Co 13:4"
    // Regex: nome do livro (com acento e hífen), capítulo, versículo inicial, opcional hífen e versículo final
    const match = referencia.match(/^([1-3]?\s?[A-Za-zÀ-ÿçÇãõéíúâêô\- ]+)\s*(\d+):(\d+)(?:-(\d+))?/i);
    if (!match) {
      setErro('Referência inválida');
      setLoading(false);
      return;
    }
    const livroRef = match[1].trim().toLowerCase();
    const cap = parseInt(match[2], 10) - 1;
    const versIni = parseInt(match[3], 10) - 1;
    const versFim = match[4] ? parseInt(match[4], 10) - 1 : versIni;
    fetch('/api/biblia')
      .then(res => res.json())
      .then((data: LivroArray[]) => {
        // Busca por nome completo ou abreviação
        const livro = data.find(l =>
          l.abbrev.toLowerCase() === livroRef.replace(/\s/g, '') ||
          (l.name && l.name.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s/g, '').startsWith(livroRef.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s/g, '')))
        );
        if (!livro) {
          setErro('Livro não encontrado');
          setLoading(false);
          return;
        }
        if (!livro.chapters[cap]) {
          setErro('Capítulo não encontrado');
          setLoading(false);
          return;
        }
        const capitulo = livro.chapters[cap];
        if (versIni < 0 || versIni >= capitulo.length || versFim < versIni || versFim >= capitulo.length) {
          setErro('Versículo não encontrado');
          setLoading(false);
          return;
        }
        const textos = capitulo.slice(versIni, versFim + 1).map((v, i) => `<b>${versIni + i + 1}</b> ${v}`).join('<br/>');
        setTexto(textos);
        setLoading(false);
      })
      .catch(() => {
        setErro('Erro ao buscar texto bíblico');
        setLoading(false);
      });
  }, [referencia]);

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999
    }}>
      <div style={{ background: '#fff', padding: 24, borderRadius: 12, minWidth: 320, maxWidth: 500 }}>
        <h3 style={{ marginTop: 0 }}>{referencia}</h3>
        {loading ? <div>Carregando...</div> : erro ? <div style={{color:'red'}}>{erro}</div> : <div style={{fontSize:18}} dangerouslySetInnerHTML={{__html: texto}}></div>}
        <button style={{ marginTop: 16 }} onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
};
