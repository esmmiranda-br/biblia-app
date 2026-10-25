import React, { useState } from 'react';

interface BackupRestoreProps {
  token: string;
  onSair: () => void;
  onRestoreComplete: () => void;
}

const MAX_ARQUIVO_BYTES = 45 * 1024 * 1024;

export const BackupRestore: React.FC<BackupRestoreProps> = ({ token, onSair, onRestoreComplete }) => {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');
  const [processando, setProcessando] = useState(false);

  const handleBackup = async () => {
    setErro('');
    setMensagem('');
    setProcessando(true);
    try {
      const response = await fetch('/api/admin/backup', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.erro || 'Não foi possível criar o backup.');
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]
        || 'biblia-app-backup.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
      setMensagem('Backup baixado. Guarde o arquivo em um local seguro.');
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível criar o backup.');
    } finally {
      setProcessando(false);
    }
  };

  const handleRestore = async () => {
    if (!arquivo) {
      setErro('Selecione um arquivo de backup.');
      return;
    }
    if (arquivo.size > MAX_ARQUIVO_BYTES) {
      setErro('O arquivo excede o limite de 45 MB.');
      return;
    }

    const confirmado = window.confirm(
      'Esta operação substituirá todos os dados atuais pelos dados do arquivo selecionado. ' +
      'Os usuários e senhas também serão os do backup. Deseja continuar?'
    );
    if (!confirmado) return;

    setErro('');
    setMensagem('');
    setProcessando(true);
    try {
      const backup = JSON.parse(await arquivo.text());
      const response = await fetch('/api/admin/restore', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(backup),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.erro || 'Não foi possível restaurar o backup.');
      }

      window.alert(`${result.mensagem} Faça login com um usuário existente no backup.`);
      onRestoreComplete();
    } catch (error) {
      setErro(error instanceof SyntaxError
        ? 'O arquivo selecionado não contém um JSON válido.'
        : error instanceof Error ? error.message : 'Não foi possível restaurar o backup.');
    } finally {
      setProcessando(false);
    }
  };

  return (
    <main className="backup-restore-screen">
      <section className="backup-restore-card">
        <header className="backup-restore-header">
          <div>
            <h2>Backup e restauração</h2>
            <p>Proteja os dados do aplicativo e restaure-os quando necessário.</p>
          </div>
          <button type="button" className="backup-restore-secondary" onClick={onSair}>
            Voltar
          </button>
        </header>

        <section className="backup-restore-section">
          <h3>Criar backup</h3>
          <p>Baixe uma cópia dos sermões, estudos, devocionais, compromissos e usuários.</p>
          <p className="backup-restore-notice">
            O arquivo contém hashes de senhas e deve ser guardado em local seguro. As sessões não são
            incluídas; após uma restauração, todos precisarão entrar novamente.
          </p>
          <button type="button" className="backup-restore-primary" onClick={handleBackup} disabled={processando}>
            Baixar backup
          </button>
        </section>

        <section className="backup-restore-section">
          <h3>Restaurar backup</h3>
          <p>A restauração substitui integralmente os dados atuais pelos dados do arquivo.</p>
          <label className="backup-restore-file-label">
            Arquivo JSON do backup
            <input
              type="file"
              accept=".json,application/json"
              disabled={processando}
              onChange={event => {
                setArquivo(event.target.files?.[0] || null);
                setErro('');
                setMensagem('');
              }}
            />
          </label>
          <button
            type="button"
            className="backup-restore-danger"
            onClick={handleRestore}
            disabled={processando || !arquivo}
          >
            Restaurar backup
          </button>
        </section>

        {processando && <p className="backup-restore-status">Processando...</p>}
        {mensagem && <p className="backup-restore-success" role="status">{mensagem}</p>}
        {erro && <p className="backup-restore-error" role="alert">{erro}</p>}
      </section>
    </main>
  );
};
