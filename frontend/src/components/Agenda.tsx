import React, { useCallback, useEffect, useMemo, useState } from 'react';

interface Compromisso {
  id: number;
  titulo: string;
  dataHora: string;
  local: string;
  descricao: string;
  usuario: string;
  recorrenciaId: string | null;
}

interface AgendaProps {
  usuario: { usuario: string; perfil: string; token: string };
  onSair: () => void;
}

interface CompromissoForm {
  titulo: string;
  dataHora: string;
  local: string;
  descricao: string;
  recorrente: boolean;
  semanas: number;
}

type EscopoRecorrencia = 'individual' | 'serie';
type AcaoRecorrencia = {
  tipo: 'alterar' | 'excluir';
  compromisso: Compromisso;
} | null;

const initialForm: CompromissoForm = {
  titulo: '',
  dataHora: '',
  local: '',
  descricao: '',
  recorrente: false,
  semanas: 2,
};

const inputStyle: React.CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  padding: 10,
  borderRadius: 8,
  border: '1px solid #ccc',
  fontSize: 16,
};

const primaryButtonStyle: React.CSSProperties = {
  background: '#4e54c8',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '8px 16px',
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  background: '#eee',
  color: '#4e54c8',
};

const weekdayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function toDateTimeInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sameDay(first: Date, second: Date) {
  return dateKey(first) === dateKey(second);
}

function shiftMonth(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function weeklyOccurrenceDates(dataHora: string, semanas: number) {
  const inicio = new Date(dataHora);
  return Array.from({ length: semanas }, (_, index) => {
    const ocorrencia = new Date(inicio);
    ocorrencia.setDate(ocorrencia.getDate() + index * 7);
    return ocorrencia.toISOString();
  });
}

export const Agenda: React.FC<AgendaProps> = ({ usuario, onSair }) => {
  const [compromissos, setCompromissos] = useState<Compromisso[]>([]);
  const [form, setForm] = useState<CompromissoForm>(initialForm);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [visualizando, setVisualizando] = useState<Compromisso | null>(null);
  const [acaoRecorrencia, setAcaoRecorrencia] = useState<AcaoRecorrencia>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mesVisivel, setMesVisivel] = useState(() => {
    const hoje = new Date();
    return new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  });
  const [diaSelecionado, setDiaSelecionado] = useState(() => dateKey(new Date()));

  const carregarCompromissos = useCallback(async () => {
    setErro(null);
    try {
      const response = await fetch('/api/compromissos', {
        headers: { Authorization: `Bearer ${usuario.token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.erro || 'Não foi possível carregar a agenda.');
      if (!Array.isArray(data)) throw new Error('Resposta inválida ao carregar a agenda.');
      setCompromissos(data);
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao carregar a agenda.');
    } finally {
      setLoading(false);
    }
  }, [usuario.token]);

  useEffect(() => {
    carregarCompromissos();
  }, [carregarCompromissos]);

  const compromissosDoDia = useMemo(() => compromissos.filter(compromisso => {
    const dataHora = new Date(compromisso.dataHora);
    return !Number.isNaN(dataHora.getTime()) && dateKey(dataHora) === diaSelecionado;
  }), [compromissos, diaSelecionado]);

  const diasDoCalendario = useMemo(() => {
    const primeiroDia = new Date(mesVisivel.getFullYear(), mesVisivel.getMonth(), 1);
    const inicio = new Date(
      primeiroDia.getFullYear(),
      primeiroDia.getMonth(),
      primeiroDia.getDate() - primeiroDia.getDay()
    );
    return Array.from({ length: 42 }, (_, index) =>
      new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + index)
    );
  }, [mesVisivel]);

  const alterarCampo = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = event.target;
    if (name === 'recorrente' && event.target instanceof HTMLInputElement) {
      const checked = event.target.checked;
      setForm(current => ({ ...current, recorrente: checked }));
      return;
    }
    setForm(current => ({
      ...current,
      [name]: name === 'semanas' ? Number(value) : value,
    }));
  };

  const cancelarEdicao = () => {
    setForm(initialForm);
    setEditandoId(null);
  };

  const enviarAlteracao = async (escopo: EscopoRecorrencia) => {
    if (editandoId === null) return;
    const dataHora = new Date(form.dataHora);
    const response = await fetch(
      `/api/compromissos/${editandoId}?escopo=${escopo}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${usuario.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...form,
          dataHora: dataHora.toISOString(),
        }),
      }
    );
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(data?.erro || 'Não foi possível salvar o compromisso.');
  };

  const salvarCompromisso = async (event: React.FormEvent) => {
    event.preventDefault();
    setErro(null);
    const dataHora = new Date(form.dataHora);
    if (Number.isNaN(dataHora.getTime())) {
      setErro('Informe uma data e hora válidas.');
      return;
    }
    if (form.recorrente && (!Number.isInteger(form.semanas) || form.semanas < 2 || form.semanas > 52)) {
      setErro('Informe de 2 a 52 semanas para a recorrência.');
      return;
    }

    const compromissoEditado = compromissos.find(item => item.id === editandoId);
    if (compromissoEditado?.recorrenciaId) {
      setAcaoRecorrencia({ tipo: 'alterar', compromisso: compromissoEditado });
      return;
    }

    setSalvando(true);
    try {
      const response = await fetch(
        editandoId === null ? '/api/compromissos' : `/api/compromissos/${editandoId}`,
        {
          method: editandoId === null ? 'POST' : 'PUT',
          headers: {
            Authorization: `Bearer ${usuario.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...form,
            dataHora: dataHora.toISOString(),
            datasOcorrencias: form.recorrente
              ? weeklyOccurrenceDates(form.dataHora, form.semanas)
              : undefined,
          }),
        }
      );
      const data = response.status === 204 ? null : await response.json();
      if (!response.ok) throw new Error(data?.erro || 'Não foi possível salvar o compromisso.');
      cancelarEdicao();
      await carregarCompromissos();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao salvar o compromisso.');
    } finally {
      setSalvando(false);
    }
  };

  const confirmarAlteracao = async (escopo: EscopoRecorrencia) => {
    setSalvando(true);
    setErro(null);
    try {
      await enviarAlteracao(escopo);
      setAcaoRecorrencia(null);
      cancelarEdicao();
      await carregarCompromissos();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao salvar o compromisso.');
      setAcaoRecorrencia(null);
    } finally {
      setSalvando(false);
    }
  };

  const iniciarEdicao = (compromisso: Compromisso) => {
    setForm({
      titulo: compromisso.titulo,
      dataHora: toDateTimeInput(compromisso.dataHora),
      local: compromisso.local,
      descricao: compromisso.descricao,
      recorrente: false,
      semanas: 2,
    });
    setEditandoId(compromisso.id);
    setVisualizando(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const solicitarExclusao = (compromisso: Compromisso) => {
    if (compromisso.recorrenciaId) {
      setAcaoRecorrencia({ tipo: 'excluir', compromisso });
      return;
    }
    void excluirCompromisso(compromisso, 'individual');
  };

  const excluirCompromisso = async (
    compromisso: Compromisso,
    escopo: EscopoRecorrencia
  ) => {
    const descricaoEscopo = escopo === 'serie' ? 'todos os compromissos desta recorrência' : 'este compromisso';
    if (!window.confirm(`Deseja excluir "${compromisso.titulo}" (${descricaoEscopo})?`)) return;
    setErro(null);
    try {
      const response = await fetch(
        `/api/compromissos/${compromisso.id}?escopo=${escopo}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${usuario.token}` },
        }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.erro || 'Não foi possível excluir o compromisso.');
      }
      setAcaoRecorrencia(null);
      if (visualizando?.id === compromisso.id) setVisualizando(null);
      await carregarCompromissos();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao excluir o compromisso.');
      setAcaoRecorrencia(null);
    }
  };

  const podeGerenciar = (compromisso: Compromisso) =>
    usuario.perfil === 'admin' || compromisso.usuario === usuario.usuario;

  const tituloMes = mesVisivel.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  const dataSelecionada = new Date(`${diaSelecionado}T12:00:00`);

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5fb', padding: 24 }}>
      <main style={{ maxWidth: 1000, margin: '0 auto' }}>
        <header style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          marginBottom: 20,
        }}>
          <h2 style={{ color: '#4e54c8', margin: 0 }}>Agenda de Compromissos da Igreja</h2>
          <button type="button" onClick={onSair} style={primaryButtonStyle}>Voltar</button>
        </header>

        {erro && (
          <div role="alert" style={{ color: '#a12622', background: '#fff0ef', padding: 12, borderRadius: 8, marginBottom: 16 }}>
            {erro}
          </div>
        )}

        <form onSubmit={salvarCompromisso} style={{
          display: 'grid',
          gap: 12,
          background: '#fff',
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
          boxShadow: '0 2px 8px #0001',
        }}>
          <h3 style={{ color: '#4e54c8', margin: 0 }}>
            {editandoId === null ? 'Novo compromisso' : 'Alterar compromisso'}
          </h3>
          <label>
            Título
            <input
              name="titulo"
              value={form.titulo}
              onChange={alterarCampo}
              required
              maxLength={160}
              style={inputStyle}
            />
          </label>
          <label>
            Data e hora
            <input
              name="dataHora"
              type="datetime-local"
              value={form.dataHora}
              onChange={alterarCampo}
              required
              style={inputStyle}
            />
          </label>
          {editandoId === null && (
            <section
              aria-labelledby="recorrencia-titulo"
              style={{
                display: 'grid',
                gap: 10,
                padding: 14,
                border: '1px solid #d9daf5',
                borderRadius: 8,
                background: '#f8f8ff',
              }}
            >
              <div>
                <h4 id="recorrencia-titulo" style={{ color: '#4e54c8', margin: '0 0 4px' }}>
                  Recorrência
                </h4>
                <p style={{ margin: 0, color: '#555', fontSize: 14 }}>
                  Quer que este compromisso se repita nas próximas semanas?
                </p>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, cursor: 'pointer' }}>
                <input
                  name="recorrente"
                  type="checkbox"
                  checked={form.recorrente}
                  onChange={alterarCampo}
                  style={{ width: 18, height: 18, accentColor: '#4e54c8' }}
                />
                Repetir este compromisso semanalmente
              </label>
              {form.recorrente && (
                <label>
                  Número de ocorrências (incluindo a primeira semana)
                  <input
                    name="semanas"
                    type="number"
                    min={2}
                    max={52}
                    value={form.semanas}
                    onChange={alterarCampo}
                    required
                    style={inputStyle}
                  />
                </label>
              )}
            </section>
          )}
          <label>
            Local
            <input
              name="local"
              value={form.local}
              onChange={alterarCampo}
              maxLength={200}
              style={inputStyle}
            />
          </label>
          <label>
            Descrição
            <textarea
              name="descricao"
              value={form.descricao}
              onChange={alterarCampo}
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={salvando} style={primaryButtonStyle}>
              {salvando ? 'Salvando...' : editandoId === null ? 'Adicionar compromisso' : 'Salvar alterações'}
            </button>
            {editandoId !== null && (
              <button type="button" onClick={cancelarEdicao} style={secondaryButtonStyle}>
                Cancelar
              </button>
            )}
          </div>
        </form>

        <section style={{
          background: '#fff',
          borderRadius: 12,
          padding: 20,
          boxShadow: '0 2px 8px #0001',
        }} aria-label="Calendário de compromissos">
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            marginBottom: 16,
          }}>
            <button type="button" aria-label="Mês anterior" onClick={() => {
              const mes = shiftMonth(mesVisivel, -1);
              setMesVisivel(mes);
              setDiaSelecionado(dateKey(mes));
            }} style={secondaryButtonStyle}>
              ‹
            </button>
            <h3 style={{ color: '#4e54c8', textTransform: 'capitalize', margin: 0 }}>{tituloMes}</h3>
            <button type="button" aria-label="Próximo mês" onClick={() => {
              const mes = shiftMonth(mesVisivel, 1);
              setMesVisivel(mes);
              setDiaSelecionado(dateKey(mes));
            }} style={secondaryButtonStyle}>
              ›
            </button>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            gap: 4,
            textAlign: 'center',
          }}>
            {weekdayLabels.map(dia => (
              <div key={dia} style={{ fontWeight: 700, color: '#555', padding: '8px 0' }}>{dia}</div>
            ))}
            {diasDoCalendario.map(dia => {
              const chave = dateKey(dia);
              const total = compromissos.filter(compromisso =>
                sameDay(new Date(compromisso.dataHora), dia)
              ).length;
              const selecionado = chave === diaSelecionado;
              const noMes = dia.getMonth() === mesVisivel.getMonth();
              return (
                <button
                  key={chave}
                  type="button"
                  aria-label={`${dia.toLocaleDateString('pt-BR')}${total ? `, ${total} compromisso${total === 1 ? '' : 's'}` : ''}`}
                  aria-pressed={selecionado}
                  onClick={() => {
                    setDiaSelecionado(chave);
                    if (!noMes) setMesVisivel(new Date(dia.getFullYear(), dia.getMonth(), 1));
                  }}
                  style={{
                    minHeight: 64,
                    border: selecionado ? '2px solid #4e54c8' : '1px solid #e4e5ed',
                    borderRadius: 8,
                    background: selecionado ? '#f0f0ff' : '#fff',
                    color: noMes ? '#222' : '#aaa',
                    cursor: 'pointer',
                    fontWeight: selecionado ? 700 : 400,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                >
                  <span>{dia.getDate()}</span>
                  {total > 0 && (
                    <span aria-hidden="true" style={{
                      background: '#4e54c8',
                      color: '#fff',
                      borderRadius: 10,
                      minWidth: 20,
                      padding: '1px 5px',
                      fontSize: 12,
                    }}>{total}</span>
                  )}
                </button>
              );
            })}
          </div>
          <section aria-live="polite" style={{ marginTop: 24 }}>
            <h3 style={{ color: '#4e54c8' }}>
              Compromissos de {dataSelecionada.toLocaleDateString('pt-BR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </h3>
            {loading ? (
              <p>Carregando agenda...</p>
            ) : compromissosDoDia.length === 0 ? (
              <p>Nenhum compromisso neste dia.</p>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {compromissosDoDia.map(compromisso => (
                  <article key={compromisso.id} style={{
                    background: '#f9f9ff',
                    border: '1px solid #e4e5ed',
                    borderRadius: 12,
                    padding: 16,
                  }}>
                    <h4 style={{ color: '#4e54c8', margin: '0 0 8px' }}>
                      {compromisso.titulo}
                      {compromisso.recorrenciaId && (
                        <span style={{ color: '#666', fontSize: 13, fontWeight: 400 }}> · semanal</span>
                      )}
                    </h4>
                    <div><strong>Horário:</strong> {new Date(compromisso.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                    {compromisso.local && <div><strong>Local:</strong> {compromisso.local}</div>}
                    <div><strong>Organizado por:</strong> {compromisso.usuario}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                      <button type="button" onClick={() => setVisualizando(compromisso)} style={primaryButtonStyle}>
                        Visualizar
                      </button>
                      {podeGerenciar(compromisso) && (
                        <>
                          <button type="button" onClick={() => iniciarEdicao(compromisso)} style={secondaryButtonStyle}>
                            Alterar
                          </button>
                          <button type="button" onClick={() => solicitarExclusao(compromisso)} style={{ ...primaryButtonStyle, background: '#a12622' }}>
                            Excluir
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </main>

      {visualizando && (
        <div
          role="presentation"
          onClick={event => {
            if (event.target === event.currentTarget) setVisualizando(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: '#0008',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 1000,
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="compromisso-titulo" style={{
            width: '100%',
            maxWidth: 560,
            background: '#fff',
            borderRadius: 12,
            padding: 24,
          }}>
            <h3 id="compromisso-titulo" style={{ color: '#4e54c8', marginTop: 0 }}>
              {visualizando.titulo}
            </h3>
            <p><strong>Data e hora:</strong> {new Date(visualizando.dataHora).toLocaleString('pt-BR')}</p>
            <p><strong>Local:</strong> {visualizando.local || 'Não informado'}</p>
            <p><strong>Organizado por:</strong> {visualizando.usuario}</p>
            {visualizando.recorrenciaId && <p>Este evento faz parte de uma recorrência semanal.</p>}
            <p style={{ whiteSpace: 'pre-wrap' }}>{visualizando.descricao || 'Sem descrição.'}</p>
            <button type="button" onClick={() => setVisualizando(null)} style={primaryButtonStyle}>
              Fechar
            </button>
          </section>
        </div>
      )}

      {acaoRecorrencia && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            background: '#0008',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 1001,
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="escopo-recorrencia-titulo" style={{
            width: '100%',
            maxWidth: 460,
            background: '#fff',
            borderRadius: 12,
            padding: 24,
            boxShadow: '0 4px 24px #0003',
          }}>
            <h3 id="escopo-recorrencia-titulo" style={{ color: '#4e54c8', marginTop: 0 }}>
              {acaoRecorrencia.tipo === 'alterar' ? 'Alterar evento recorrente' : 'Excluir evento recorrente'}
            </h3>
            <p>O que deseja fazer com “{acaoRecorrencia.compromisso.titulo}”?</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {acaoRecorrencia.tipo === 'alterar' ? (
                <>
                  <button type="button" disabled={salvando} onClick={() => void confirmarAlteracao('individual')} style={primaryButtonStyle}>
                    Só este evento
                  </button>
                  <button type="button" disabled={salvando} onClick={() => void confirmarAlteracao('serie')} style={primaryButtonStyle}>
                    Toda a recorrência
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void excluirCompromisso(acaoRecorrencia.compromisso, 'individual')}
                    style={primaryButtonStyle}
                  >
                    Só este evento
                  </button>
                  <button
                    type="button"
                    onClick={() => void excluirCompromisso(acaoRecorrencia.compromisso, 'serie')}
                    style={{ ...primaryButtonStyle, background: '#a12622' }}
                  >
                    Toda a recorrência
                  </button>
                </>
              )}
              <button type="button" onClick={() => setAcaoRecorrencia(null)} style={secondaryButtonStyle}>
                Cancelar
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
