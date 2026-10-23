import React from 'react';

interface VersiculoProps {
  livro: string;
  capitulo: number;
  versiculo: number;
  texto: string;
}

export const Versiculo: React.FC<VersiculoProps> = ({ livro, capitulo, versiculo, texto }) => (
  <div style={{ margin: '1rem 0', padding: '1rem', border: '1px solid #ccc', borderRadius: 8 }}>
    <strong>{livro} {capitulo}:{versiculo}</strong>
    <p>{texto}</p>
  </div>
);
